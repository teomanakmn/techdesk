import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const files = directory => readdirSync(directory,{withFileTypes:true}).flatMap(e => e.isDirectory() ? files(`${directory}/${e.name}`) : [`${directory}/${e.name}`])
const privilegedJwt = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
for (const file of files('dist').filter(path => /\.(js|html|css|map)$/.test(path))) {
  const content = readFileSync(file,'utf8')
  assert(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(content), `Secret key found in ${file}`)
  assert(!content.includes('synthetic-privileged-build-canary'), `Privileged canary found in ${file}`)
  for (const token of content.match(privilegedJwt) || []) {
    const payload = JSON.parse(Buffer.from(token.split('.')[1],'base64url'))
    assert(payload.role !== 'service_role', `Privileged JWT found in ${file}`)
  }
}
console.log('Client bundle contains no secret-key value, privileged JWT, or privileged build canary.')
