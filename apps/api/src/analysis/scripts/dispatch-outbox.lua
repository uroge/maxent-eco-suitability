local outboxPayload = redis.call('GET', KEYS[1])
local analysisPayload = redis.call('GET', KEYS[2])
if not outboxPayload or not analysisPayload then
  return { 'missing' }
end

local outbox = cjson.decode(outboxPayload)
local analysis = cjson.decode(analysisPayload)
if outbox.leaseId ~= ARGV[1] or analysis.status ~= 'queued' then
  return { 'invalid' }
end

outbox.status = 'dispatched'
outbox.dispatchedAt = ARGV[2]
outbox.leaseId = cjson.null
outbox.leaseExpiresAt = cjson.null
analysis.execution.outboxDispatchedAt = ARGV[2]
analysis.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(outbox), 'KEEPTTL')
redis.call('SET', KEYS[2], cjson.encode(analysis), 'KEEPTTL')
redis.call('ZREM', KEYS[3], ARGV[3])
return { 'dispatched' }
