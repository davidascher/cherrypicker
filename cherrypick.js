require.paths.unshift(__dirname);
require.paths.unshift(__dirname+'/lib');
require.paths.unshift(__dirname+'/deps/node-paperboy/lib');
require.paths.unshift(__dirname+'/deps/node-smtp/lib');
require.paths.unshift(__dirname+'/deps');

var sys = require('sys');
var http = require('http');
var fs = require('fs');
var UUID = require("uuid").UUID
var redis_ = require('redis');
var redis = redis_.createClient();
var RedisStore = require('connect-redis');
var config = require('config');
var paperboy = require('paperboy');
var express = require('express');
var smtp = require('smtp');
var async = require('async');

function sendToken(target, uid) {
  var client = new smtp.Client();
  var from = "bot@"+ config.smtp.bannerHostname;
  var message = "Date: "+(new Date()).toString()+"\n\
From: Node-SMTP <"+from+">\n\
To: <"+target+">\n\
Subject: Almost there!\n\n\
You (or someone pretending to have access to this email address)\n\
asked for an email forwarding account on "+config.smtp.bannerHostname+"\n\
If it's you, please click on: \n\n    http://" + config.smtp.bannerHostname + "/validate/"+uid+"\n\
\n\
Yours Truly,\n\
The server.";

  client.connect(config.smtp.smarthostPort, config.smtp.smarthost).addCallback(function(){
    client.mail(from).addCallback(function(){
      client.rcpt(target).addCallback(function(){
        client.data(message).addCallback(function(){
          client.quit();
        });
      });
    });
  });
}

function api(app) {
  process.addListener('uncaughtException', function (e) {
    var msg = (e && e.message) ?  e.message : 'unknown';
    err(500, {error: 'server-error', description: msg});
  });

  var err = function(code, resp){
    var body = JSON.stringify(resp);
    res.send(body, code);
  };

  app.get('/recent_convos/:email', function(req, res, next) {
    var email = req.params.email
    var convos = [];
    redis.zrange('conversations:'+email, 0, -1, function(err, conversations) {
      async.map(conversations, function(conversation, callback) {
        redis.smembers('conversation:'+conversation, function(err, messages) {
          callback(null, messages)
        });
      }, function(err, message_lists) {
        async.map(message_lists, function(message_list, callback) {
          redis.mget(message_list, function(err, response) {
            async.map(response, function(resp, callback) {
              callback(null, JSON.parse(resp))
            }, function(err, results) {
              callback(null, results);
            });
          });
        }, function(err, convos) {
          res.send(JSON.stringify(convos), {'Content-Type': 'application/json' });
        });
      });
    });
  });

  app.get('/recent_messages/:email', function(req, res, next) {
    var email = req.params.email
    redis.zrange('messages:'+email, 0, -1, function(err, response) {
      console.log('err:', err);
      console.log('response:', response);
      redis.mget(response, function(err, response) {
        if (response) {
          msgs = []
          for (i =0 ; i < response.length; i++) {
            msgs.push(JSON.parse(response[i]))
          }
          //console.log(response)
          res.send(JSON.stringify(msgs), { 'Content-Type': 'application/json' });
        } else {
          res.send("No response from mget call");
        }
      })
    })
  });

  app.post('/submit_request', function(req, res, next) {
    console.log("GOT POST to /submit_request");
    
    // We'll create a GUID, and store the parameters in that GUID
    var uid = UUID.uuid(15);
    redis.set('request-' + uid, JSON.stringify(req.body), function(response) {
      console.log("sending email to " + req.body.target + " asking for validation (id: " + uid + ")");
      sendToken(req.body.target, uid);
      res.send('sent email')
    });
  });
  
  app.get('/validate/:id', function(req, res, next) {
    var id = 'request-'+ req.params.id;
    console.log("got validation for id:" + id);
    redis.get(id, function(err, response) {
      if (response) {
        var resp = JSON.parse(response);
        redis.set('alias:'+resp.username, resp.target, function(response) {
          redis.del(id, function() {
            // we need to know who'se our customer so we can handle emails from
            // them differently.
            console.log("ADDING a CUSTOMER!: " + 'customer:'+resp.target);
            redis.set('customer:'+resp.target, 'true', function(err, response) {
              console.log("ERR", err);
              console.log("RESPONSE", response);
              // validations expire when used.
              // set a cookie, and redirect to a successful validation page.
              res.cookie("auth", JSON.stringify(resp), {path: '/'});
              res.redirect('/#!/success')
            })
          })
          //res.send(resp);
        });
      } else {
        res.redirect("/#!/usedup"); // XXX need template.
      }
    })
  });
}

express.createServer(
  express.bodyDecoder(),
  express.cookieDecoder(),
  express.session({ store: new RedisStore, secret: 'cucumbers rock' }),
  express.router(api),
  express.staticProvider(__dirname+'/lib/../public')
).listen(config.http.port, config.http.listen);
  sys.puts('HTTP daemon running on port ' + config.http.port +
    (config.http.listen ? ' on interface ' + config.http.listen : " on all interfaces") );


