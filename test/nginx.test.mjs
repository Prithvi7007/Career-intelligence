import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, 'deploy/nginx', file), 'utf8');

test('ACME bootstrap vhost only serves certificate challenges', () => {
  const config = read('career-acme.conf');
  assert.match(config, /server_name career\.cadacrew\.fun;/);
  assert.match(config, /listen 80;/);
  assert.match(config, /\.well-known\/acme-challenge/);
  assert.match(config, /return 404;/);
  assert.doesNotMatch(config, /proxy_pass|listen 443/);
});

test('private HTTPS vhost retains login protection and localhost backend', () => {
  const config = read('career-https.conf');
  for (const required of [
    'server_name career.cadacrew.fun;',
    'listen 443 ssl;',
    'ssl_certificate /etc/letsencrypt/live/career.cadacrew.fun/fullchain.pem;',
    'ssl_certificate_key /etc/letsencrypt/live/career.cadacrew.fun/privkey.pem;',
    'auth_basic_user_file /etc/nginx/.career-intelligence.htpasswd;',
    'proxy_pass http://127.0.0.1:3417;',
    'proxy_set_header Host 127.0.0.1:3417;',
    'proxy_set_header Origin "http://127.0.0.1:3417";',
    'limit_except GET HEAD POST PATCH',
    'return 301 https://career.cadacrew.fun$request_uri;',
  ]) assert.ok(config.includes(required), 'missing Nginx security directive: ' + required);
  assert.doesNotMatch(config, /proxy_pass\s+http:\/\/(?!127\.0\.0\.1)/);
  assert.doesNotMatch(config, /auth_basic\s+off/);
});

test('runbook does not publish backend port or place secrets in Git', () => {
  const docs = read('README.md');
  assert.match(docs, /htpasswd -cB/);
  assert.match(docs, /certbot certonly --webroot/);
  assert.match(docs, /nginx -t/);
  assert.match(docs, /curl -I https:\/\/career\.cadacrew\.fun/);
  assert.match(docs, /401 Unauthorized/);
  assert.doesNotMatch(docs, /ufw allow 3417/);
  assert.doesNotMatch(docs, /listen 0\.0\.0\.0:3417/);
});
