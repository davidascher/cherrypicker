require.paths.unshift('lib');
require.paths.unshift('./deps/node-paperboy/lib');
require.paths.unshift('./deps/node-smtp/lib');
require.paths.unshift('./deps');

var config = require('config');
var fs = require('fs');
var sys = require('sys');

process.addListener('uncaughtException', function (err) {
  sys.error('Caught exception: ' + err);
  sys.error(err.stack);
});

var launch = function(){
  fs.writeFile(config.general.http_pidFile, ""+process.pid, function(err, data){
      if (err){
          sys.error("Failed to write PID file ("+ config.general.http_pidFile+"): " + err);
          process.exit(1);
      }
      require('cherrypick_http');
      //require('cherrypick_smtp');
  });
};

try{
    var pd = fs.statSync(config.general.http_pidFile);
} catch(e) {
  pd = null;
}

//if (pd && pd.isFile()) {
//  sys.puts('PID file found. Attempting to kill previous instance if running');
//  fs.readFile(config.general.http_pidFile, function(err, pid){
//    if (!err){
//      try{
//        process.kill(parseInt(pid, 10), 'SIGTERM');
//      }catch(e){}
//    }
//    launch();
//  });
//} else {
launch();
//}

