#!/bin/bash

# Create log directory
sudo mkdir -p /var/log/supervisor
sudo chown -R kali:kali /var/log/supervisor

# Start supervisor which manages VNC and noVNC
exec sudo /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
