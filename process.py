#!/usr/bin/python

import sys
import os
import errno
import getopt
import time
from ConfigParser import ConfigParser
import email
import json
import socket
import asyncore
from lxml import etree
from lxml.html import clean, fromstring, tostring
import redis
import argparse

db = redis.Redis()

parser = argparse.ArgumentParser(description='Process an email from postfix, dump into cherry db')
parser.add_argument('-r', '--rebuild', action='store_true')
parser.add_argument('--sender')
parser.add_argument('--extension')
parser.add_argument('--user')
parser.add_argument('--recipient')
parser.add_argument('--domain')


config = ConfigParser()
config.read('config.ini')
DEBUGSTREAM = open('/home/davida/t.log', 'a')
NEWLINE = '\n'
BACKUPDIR = '/home/davida/backups'


def backup(data, args):
    if not os.path.exists(BACKUPDIR):
        os.mkdir(BACKUPDIR)
    counter = os.path.join(BACKUPDIR, 'counter')
    if not os.path.exists(counter):
        open(counter,'w').write('0')
    id = str(int(open(counter).read())+1)
    open(counter, 'w').write(id)
    store = ' '.join(args) + '\n' + data
    open(os.path.join(BACKUPDIR, id), 'w').write(store)


def domain_from_address(address):
    realname, addr = email.utils.parseaddr(address)
    if '@' in addr:
        username, domain = addr.split('@', 1)
        return domain

def clean_html(html):
    remove_attrs = ['class']
    remove_tags = ['table', 'tr', 'td', 'html', 'body']
    nonempty_tags = ['a', 'p', 'span', 'div']
    
    cleaner = clean.Cleaner(remove_tags=remove_tags)

    clean_html = cleaner.clean_html(html)
    # now remove the useless empty tags
    root = fromstring(clean_html)
    context = etree.iterwalk(root) # just the end tag event
    for action, elem in context:
        clean_text = elem.text and elem.text.strip(' \t\r\n')
        if elem.tag in nonempty_tags and \
        not (len(elem) or clean_text): # no children nor text
            elem.getparent().remove(elem)
            continue
        elem.text = clean_text # if you want
        # and if you also wanna remove some attrs:
        for badattr in remove_attrs:
            if elem.attrib.has_key(badattr):
                del elem.attrib[badattr]
    return tostring(root)

def addSenderBasedOnMessage(mailfrom, rcpttos, data):
    # we'll see if it's a message _from_ someone we're forwarding mail for
    print >> DEBUGSTREAM, "mail from:", '*'+mailfrom+'*'
    if not db.get('customer:'+mailfrom):
        print >> DEBUGSTREAM, "didn't find that customer in our DB"
        # this isn't from one of our customers, should bounce it XXX
        return
    # extract the forwarded message to figure out who sent that.
    print >> DEBUGSTREAM, "Got a message that we want to extract senders from"
    for part in msg.walk():
        if part.get_content_type() == 'text/plain':
            payload = part.get_payload()
            lines = payload.split('\n')
            for line in lines:
                if ':' in line:
                    h,v = line.split(':', 1)
                    if h == 'From':
                        domain = domain_from_address(v)
                        if domain:
                            print >> DEBUGSTREAM, "From now on we keep emails from " + domain + " intended for " + mailfrom
                            db.set('knownsender:' + domain + ':' + mailfrom, 'true')

def store_message(mailfrom, target, rcpttos, msg):
    blob = {
        'mid': msg.get('Message-ID'),
        'receivedDate': msg.get('Date'),
        'subject': msg.get('Subject')
    }
    _from_name, _from_email = email.Utils.parseaddr(msg.get('From'))
    blob['from'] = {
        'name': _from_name,
        'email': _from_email
    }
    _replyto_name, _replyto_email = email.Utils.parseaddr(msg.get('Reply-To', msg.get('From')))
    blob['replyto'] = {
        'name': _replyto_name,
        'email': _replyto_email
    }
    blob['to'] = [{'name': _to[0], 'email': _to[1]} for _to in [email.Utils.parseaddr(_t) for _t in msg.get_all('To', [])]]
    blob['cc'] = [{'name': _to[0], 'email': _to[1]} for _to in [email.Utils.parseaddr(_t) for _t in msg.get_all('Cc', [])]]
    blob['flags'] = {}

    text_parts = []
    html_parts = []
    for part in msg.walk():
        if part.get_content_type() == 'text/html':
            #html_parts.append(clean_html(part.get_payload()))
            html_parts.append(part.get_payload())
            body = part.get_payload()
        elif part.get_content_type() == 'text/plain':
            text_parts.append(part.get_payload())
            body = part.get_payload()
    blob['body'] = body
    #simple_msg = {'headers': headers, 'text_parts': text_parts, 'html_parts': html_parts}
    simple_msg_json = json.dumps(blob)
    timestamp = time.time()
    
    msgid = db.get('msgid_counter')
    if msgid:
        msgid = db.incr('msgid_counter')
    else:
        db.set('msgid_counter', 1)
        msgid = 1
        
    #print >> DEBUGSTREAM, simple_msg
    
    msgkey = 'message:'+str(msgid)
    print >> DEBUGSTREAM, "added message: ", msgid
    db.set(msgkey, simple_msg_json) # storing the msg once
    db.zadd('messages:'+target, msgkey, timestamp) # all messages to me
    db.zadd('messages_from:'+target+':'+mailfrom, msgkey, timestamp) # all messages from you to me
    
    

def _deliver(_from, _tos, data):
    import smtplib
    refused = {}
    try:
        s = smtplib.SMTP()
        print >> DEBUGSTREAM, config.get('smtp', 'smarthost'), config.get('smtp', 'smarthostPort')
        s.connect(config.get('smtp', 'smarthost'),
                  config.get('smtp', 'smarthostPort'))
        try:
            refused = s.sendmail(_from, _tos, data)
        finally:
            s.quit()
    except smtplib.SMTPRecipientsRefused, e:
        print >> DEBUGSTREAM, 'got SMTPRecipientsRefused'
        refused = e.recipients
    except (socket.error, smtplib.SMTPException), e:
        print >> DEBUGSTREAM, 'got', e.__class__
        # All recipients were refused.  If the exception had an associated
        # error code, use it.  Otherwise,fake it with a non-triggering
        # exception code.
        errcode = getattr(e, 'smtp_code', -1)
        errmsg = getattr(e, 'smtp_error', 'ignore')
        for r in _tos:
            refused[r] = (errcode, errmsg)
    return refused

def process_message(data, sender, recipients, forward=True):
    msg = email.message_from_string(data)
    print >>DEBUGSTREAM, "processing message from", sender, "to", recipients
    _from = sender # email.Utils.parseaddr(msg.get('From'))[1]
    _recipients = [email.Utils.parseaddr(_to)[1] for _to in recipients.split(',')]

    # first, figure out if this is a sample we should use to populate the
    # known senders list
    if _recipients[0][1] == 'addthis':
        addSenderBasedOnMessage(_from, _recipients, msg)
        return
    
    # look up rcpttos in our redis db, and swap them if we have them in
    # our db.
    acceptable = False
    new_tos = []
    for _to in _recipients:
        print >>DEBUGSTREAM, "TO is", _to
        username, domain = _to.split('@', 1)
        new_to = _to
        if domain == host:
            print >> DEBUGSTREAM, "message for us"
            target = db.get('alias:'+username)
            if target:
                print >> DEBUGSTREAM, "FOUND a mapping from " + username + " to " + target
                acceptable = True
                new_to = target
        new_tos.append(new_to)

    if not acceptable:
      # XXX we should really bounce the mail
      return

    # is this an email we can deal with here, or do we forward it?
    action = "store" # for now, we always store, for testing. # "forward"
    
    domain = _from[1]
    print >> DEBUGSTREAM, "domain", domain, "target", target
    if db.exists('knownsender:' + domain + ':' + target):
        action = 'store'

    if action == 'forward' and forward:
        print >>DEBUGSTREAM, "just forwarding"
        refused = _deliver(_from, _recipients, msg.as_string())
        # TBD: what to do with refused addresses?
        if refused:
          print >> DEBUGSTREAM, 'we got some refusals:', refused
    elif action == 'store':
        if forward:
            print >>DEBUGSTREAM, "forwarding, and... "
            #print >>DEBUGSTREAM, msg.as_string()
            try:
                refused = _deliver(_from, new_tos, msg.as_string())
            except TypeError, e:
                print >> DEBUGSTREAM, "TYPEERROR data was: " + msg.as_string()
        print >> DEBUGSTREAM, 'storing the message'
        store_message(_from, target, new_tos, msg)

def rebuild():
    # first, get rid of all keys that we create
    msgkeys = db.keys('message*')
    print >>DEBUGSTREAM, "deleting keys", msgkeys
    if msgkeys:
        db.delete(*msgkeys)
    db.delete('msgid_counter')
    # then find all of the files in the backup dir, and process them each in turn
    files = [int(f) for f in os.listdir(BACKUPDIR) if f != 'counter']
    files.sort()
    for f in files:
        full = open(os.path.join(BACKUPDIR, str(f))).read()
        argline, data = full.split('\n', 1)
        args = parser.parse_args(argline.split())
        print >> DEBUGSTREAM, "adding message", argline
        process_message(data, args.sender, args.recipient, forward=False)

try:
    args = parser.parse_args(sys.argv[1:])
    host = config.get('smtp', 'bannerHostname')
    port = config.getint('smtp', 'port')
    smarthost = config.get('smtp', 'smarthost')
    smarthostPort = config.getint('smtp', 'smarthostPort')
    
    if args.rebuild:
        rebuild()
    else:
        data = sys.stdin.read()
        backup(data, sys.argv[1:])
    
        args = parser.parse_args(sys.argv[1:])
        
        process_message(data, args.sender, args.recipient)
    
except Exception, e:
    print >>DEBUGSTREAM, e
    import traceback
    traceback.print_exc(file=DEBUGSTREAM)
    log = traceback.format_exc()
    _deliver('process.py@david.raindrop.it', 'dascher@mozilla.com', log)
    raise