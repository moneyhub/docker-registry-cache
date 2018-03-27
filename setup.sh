#!/usr/bin/env bash
set -e

read -p "Enter Your Local Registry Hostname or IP: " LOCAL_REGISTRY
read -p "Enter Source Registry (default: quay.io): " SOURCE_REGISTRY
if [ -x $LOCAL_REGISTRY ]; then
    echo "ERROR: Local or source registry name not provided!"
    exit 1
fi

if [ -x $SOURCE_REGISTRY ]; then
    SOURCE_REGISTRY="quay.io"
fi

mkdir data

cp certs/ssl_template.cnf certs/ssl.cnf
cp docker-compose_template.yml docker-compose.yml

if [[ $LOCAL_REGISTRY =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    sed -i s/REGISTRY_NAME_PLACEHOLDER/IP\.1\ =\ $LOCAL_REGISTRY/ certs/ssl.cnf
else
    sed -i s/REGISTRY_NAME_PLACEHOLDER/DNS\.1\ =\ $LOCAL_REGISTRY/ certs/ssl.cnf
fi
    sed -i s/LOCAL_REGISTRY_ADDRESS/$LOCAL_REGISTRY/ docker-compose.yml
    sed -i s/SOURCE_REGISTRY_ADDRESS/$SOURCE_REGISTRY/ docker-compose.yml

openssl req  -newkey rsa:2048 -nodes -days 365 -sha256  -subj "/CN=local-registry" -keyout certs/domain.key -x509 -out certs/domain.crt -extensions v3_req -config certs/ssl.cnf
rm certs/ssl.cnf

sudo mkdir -p /etc/docker/certs.d/$LOCAL_REGISTRY:5000
sudo cp certs/domain.crt /etc/docker/certs.d/$LOCAL_REGISTRY:5000/ca.crt

# Restart docker to read certificates
sudo systemctl restart docker

docker-compose up -d
