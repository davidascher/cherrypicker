from fabric.api import run, env
from fabric.operations import sudo
from fabric.context_managers import cd
from fabric.contrib.project import rsync_project

env.hosts = ['david.raindrop.it']

def restart():
    sudo('restart cherry', pty=True)

def stop():
    sudo('stop cherry', pty=True)

def start():
    sudo('start cherry', pty=True)

def rsync():
    rsync_project('~/src/')
    
def deploy():
    rsync()
    restart()
