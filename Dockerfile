FROM node:8-slim

RUN apt-get update && apt-get -y install apt-utils curl && curl -fsSL https://get.docker.com/ | sh

ADD package.json /opt/app/package.json
ADD src /opt/app/src
RUN cd /opt/app && npm install --production

WORKDIR /opt/app

ENV PORT=80

EXPOSE 80

CMD ["node", "src/index.js"]
