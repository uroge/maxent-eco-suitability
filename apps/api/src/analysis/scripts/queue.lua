local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end

if analysis.status == 'queued' and type(analysis.execution) == 'table' and analysis.execution.jobId == ARGV[2] then
  return { 'queued', payload }
end

if analysis.status ~= 'ready' then
  return { 'invalid' }
end

local now = ARGV[3]
analysis.status = 'queued'
analysis.updatedAt = now
analysis.failure = cjson.null
analysis.progress = { stage = 'queued', percent = 0, attempt = cjson.null, updatedAt = now }
analysis.execution = { jobId = ARGV[2], attempt = cjson.null, outboxDispatchedAt = cjson.null }

local outbox = {
  analysisId = analysis.id,
  ownerId = analysis.ownerId,
  jobId = ARGV[2],
  status = 'pending',
  createdAt = now,
  dispatchedAt = cjson.null,
  leaseId = cjson.null,
  leaseExpiresAt = cjson.null
}

redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then
  redis.call('SET', KEYS[2], cjson.encode(outbox), 'PX', ttl)
else
  redis.call('SET', KEYS[2], cjson.encode(outbox))
end
redis.call('ZADD', KEYS[3], ARGV[4], analysis.id)
return { 'queued', cjson.encode(analysis) }
