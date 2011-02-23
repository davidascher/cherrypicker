import sys, os, subprocess
from ConfigParser import ConfigParser

config = ConfigParser()
config.read('config.ini')

smtp_pid_fn = config.get('general', 'smtp_pidFile')
http_pid_fn = config.get('general', 'http_pidFile')
smtp_pid = None
print smtp_pid_fn, http_pid_fn
if os.path.exists(smtp_pid_fn):
  smtp_pid = int(open(smtp_pid_fn).read())
http_pid = None
if os.path.exists(http_pid_fn):
  http_pid = int(open(http_pid_fn).read())

print sys.argv
def stop():
  if smtp_pid or http_pid:
    print "stopping processes"
  if smtp_pid:
    print "stopping", smtp_pid
    try:
      os.kill(smtp_pid, 9)
    except:
      print "failed to stop (or find)"
  if http_pid:
    print "stopping", http_pid
    try:
      os.kill(http_pid, 9)
    except:
      print "failed to stop (or find)"
    
def start():
  print "starting cherrypicker_smtp.py"
  subprocess.Popen(["/usr/bin/python", "cherrypick_smtp.py"])
  print "starting cherrypick.js"
  subprocess.Popen(["/home/davida/local/bin/node", "./cherrypick.js &"])

if sys.argv[1] == "stop":
  stop()
elif sys.argv[1] == "start":
  start()
elif sys.argv[1] == "restart":
  try:
    stop()
  except: pass
  start()
