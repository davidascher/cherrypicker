import smtpd
from ConfigParser import ConfigParser
import redis
import sys
import os
import errno
import getopt
import time
import email
import json
import socket
import asyncore



redis = redis.Redis()


config = ConfigParser()
config.read('config.ini')

smtp_pid_fn = config.get('general', 'smtp_pidFile')
pid = os.getpid()
open(smtp_pid_fn, 'w').write(str(pid))

host = config.get('smtp', 'bannerHostname')
port = config.getint('smtp', 'port')
smarthost = config.get('smtp', 'smarthost')
smarthostPort = config.getint('smtp', 'smarthostPort')

#smtpd.DEBUGSTREAM = sys.stderr
DEBUGSTREAM = sys.stderr
NEWLINE = '\n'

def domain_from_address(address):
    realname, addr = email.utils.parseaddr(address)
    if '@' in addr:
        username, domain = addr.split('@', 1)
        return domain

class Cherrypicker(smtpd.PureProxy):
    
    def addSenderBasedOnMessage(self, peer, mailfrom, rcpttos, data):
        # we'll see if it's a message _from_ someone we're forwarding mail for
        print >> DEBUGSTREAM, "mail from:", '*'+mailfrom+'*'
        if not redis.get('customer:'+mailfrom):
            print >> DEBUGSTREAM, "didn't find that customer in our DB"
            # this isn't from one of our customers, should bounce it XXX
            return
        # extract the forwarded message to figure out who sent that.
        print >> DEBUGSTREAM, "Got a message that we want to extract senders from"
        msg = email.message_from_string(data)
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
                                redis.set('knownsender:' + domain + ':' + mailfrom, 'true')

    def store_message(self, mailfrom, target, rcpttos, data):
        msg = email.message_from_string(data)
        headers = {
            'From': msg.get('From'),
            'To': msg.get('To'),
            'Subject': msg.get('Subject'),
            'Date': time.ctime(time.time())
        }
        parts = []
        for part in msg.walk():
            if part.get_content_type() == 'text/plain':
                parts.append(part.get_payload())
        simple_msg = {'headers': headers, 'text_parts': parts}
        simple_msg_json = json.dumps(simple_msg)
        timestamp = time.time()
        
        msgid = redis.get('msgid_counter')
        if msgid:
            msgid = redis.incr('msgid_counter')
        else:
            redis.set('msgid_counter', 1)
            msgid = 1
        
        msgkey = 'message:'+str(msgid)
        redis.set(msgkey, simple_msg_json) # storing the msg once
        redis.zadd('messages:'+target, msgkey, timestamp) # all messages to me
        redis.zadd('messages_from:'+target+':'+mailfrom, msgkey, timestamp) # all messages from you to me

    def process_message(self, peer, mailfrom, rcpttos, data):
        # first, figure out if this is a sample we should use to populate the
        # known senders list
        print "rcpttos[0].split('@',1)[0]", rcpttos[0].split('@',1)[0]
        if rcpttos[0].split('@',1)[0] == 'addthis':
            self.addSenderBasedOnMessage(peer, mailfrom, rcpttos, data)
            return

        lines = data.split('\n')
        # Look for the last header
        i = 0
        for line in lines:
            if not line:
                break
            i += 1

        # XXX do we need to add a Received: line?
        lines.insert(i, 'Received: from ' + peer[0] + "\n" +
           '        by ' + host + '\n' +
           '        ' + email.Utils.formatdate(None, True)) # specify tz

        lines.insert(i, 'X-Peer: %s' % peer[0])
        data = NEWLINE.join(lines)
        
        # look up rcpttos in our redis db, and swap them if we have them in
        # our db.
        acceptable = False
        new_rcpttos = []
        for rcptto in rcpttos:
            print "RCPTTO", rcptto
            username, domain = rcptto.split('@', 1)
            new_rcptto = rcptto
            if domain == host:
                print >> DEBUGSTREAM, "message for us"
                target = redis.get('alias:'+username)
                if target:
                    print >> DEBUGSTREAM, "FOUND a mapping from " + username + " to " + target
                    acceptable = True
                    new_rcptto = target
            new_rcpttos.append(new_rcptto)

        if not acceptable:
          # XXX we should really bounce the mail
          return

        # is this an email we can deal with here, or do we forward it?
        action = "store" # for now, we always store, for testing. # "forward"
        
        domain = domain_from_address(mailfrom)
        print "domain", domain, "target", target
        if redis.exists('knownsender:' + domain + ':' + target):
            action = 'store'

        if action == 'forward':
            refused = self._deliver(mailfrom, new_rcpttos, data)
            # TBD: what to do with refused addresses?
            if refused:
              print >> DEBUGSTREAM, 'we got some refusals:', refused
        elif action == 'store':
            refused = self._deliver(mailfrom, new_rcpttos, data)
            self.store_message(mailfrom, target, new_rcpttos, data)
            print >> DEBUGSTREAM, 'we really should store this message!!!!!!!!!!!!!'

print host, port, smarthost, smarthostPort
server = Cherrypicker(('', port), (smarthost, smarthostPort))
try:
    asyncore.loop()
except KeyboardInterrupt:
    os.unlink('cherrypick_smtp.pid')
    pass
