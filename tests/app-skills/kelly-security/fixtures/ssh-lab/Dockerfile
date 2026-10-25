FROM node@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a

RUN apt-get update && apt-get install --no-install-recommends -y openssh-server procps iproute2 && rm -rf /var/lib/apt/lists/*

COPY bootstrap.sh auth.log web-access.log audit.log /lab/
ENTRYPOINT ["/bin/sh", "/lab/bootstrap.sh"]
