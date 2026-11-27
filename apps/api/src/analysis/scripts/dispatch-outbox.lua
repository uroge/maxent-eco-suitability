local outboxPayload = redis.call('GET', KEYS[1])
if not outboxPayload then return { 'missing' } end
local outbox = cjson.decode(outboxPayload)
if outbox.leaseId ~= ARGV[1] then return { 'invalid' } end

if not outbox.validation then
  local analysisPayload = redis.call('GET', KEYS[2])
  local analysis = analysisPayload and cjson.decode(analysisPayload)
  if analysis and analysis.status == 'queued' and type(analysis.execution) == 'table' and
    analysis.execution.jobId == outbox.jobId then
    analysis.execution.outboxDispatchedAt = ARGV[2]
    analysis.updatedAt = ARGV[2]
    redis.call('SET', KEYS[2], cjson.encode(analysis), 'KEEPTTL')
  end
end

outbox.status = 'dispatched'
outbox.dispatchedAt = ARGV[2]
outbox.leaseId = cjson.null
outbox.leaseExpiresAt = cjson.null
redis.call('SET', KEYS[1], cjson.encode(outbox), 'KEEPTTL')
redis.call('ZREM', KEYS[3], ARGV[3])
return { 'dispatched' }
