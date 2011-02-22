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
            // validations expire when used.
            // set a cookie, and redirect to a successful validation page.
            res.cookie("auth", JSON.stringify(resp), {path: '/'});
            res.redirect('/#!/success')
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
  express.staticProvider('lib/../public')
).listen(config.http.port, config.http.listen);
  sys.puts('HTTP daemon running on port ' + config.http.port +
    (config.http.listen ? ' on interface ' + config.http.listen : " on all interfaces") );


