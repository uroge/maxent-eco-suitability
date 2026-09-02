local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return { 'missing' }
end

local outbox = cjson.decode(payload)
if outbox.status == 'dispatched' then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return { 'dispatched' }
end

if outbox.leaseExpiresAt and outbox.leaseExpiresAt > ARGV[2] then
  return { 'leased' }
end

outbox.leaseId = ARGV[3]
outbox.leaseExpiresAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(outbox), 'KEEPTTL')
return { 'claimed', cjson.encode(outbox) }
