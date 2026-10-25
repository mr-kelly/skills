#!/bin/sh
set -eu

mkdir -p /run/sshd /root/.ssh /var/log/nginx /var/log/audit /etc/systemd/system /tmp/.kelly-lab
cp /lab/keys/client.pub /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
cp /lab/auth.log /var/log/auth.log
cp /lab/web-access.log /var/log/nginx/access.log
cp /lab/audit.log /var/log/audit/audit.log
cat > /etc/systemd/system/kelly-lab-review.service <<'UNIT'
[Unit]
Description=Synthetic investigation fixture; never started
[Service]
ExecStart=/tmp/.kelly-lab/update --token=synthetic-service-secret
UNIT
cat > /tmp/.kelly-lab/update <<'PROGRAM'
#!/bin/sh
# A benign fixture. The test never executes it or starts the service.
exit 0
PROGRAM
chmod 700 /tmp/.kelly-lab/update
cat > /lab/sshd_config <<'CONFIG'
Port 22
ListenAddress 0.0.0.0
HostKey /lab/keys/host_ed25519
AuthorizedKeysFile /root/.ssh/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
UsePAM no
StrictModes yes
AllowAgentForwarding no
AllowTcpForwarding no
X11Forwarding no
PermitTunnel no
LogLevel ERROR
PidFile /run/sshd/kelly-lab.pid
CONFIG
exec /usr/sbin/sshd -D -e -f /lab/sshd_config
