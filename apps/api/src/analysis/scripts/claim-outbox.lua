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

if outbox.validation then
  local analysisPayload = redis.call('GET', KEYS[3])
  local analysis = analysisPayload and cjson.decode(analysisPayload)
  local validation = analysis and analysis[outbox.validation.kind]
  if not analysis or analysis.status ~= 'ready' or type(validation) ~= 'table' or
    (validation.status ~= 'queued' and validation.status ~= 'running') or
    validation.createdAt ~= outbox.createdAt or
    validation.inputRevision ~= outbox.validation.inputRevision or
    validation.configurationRevision ~= outbox.validation.configurationRevision then
    redis.call('DEL', KEYS[1])
    redis.call('ZREM', KEYS[2], ARGV[1])
    return { 'stale' }
  end
end

if type(outbox.leaseExpiresAt) == 'string' and outbox.leaseExpiresAt > ARGV[2] then
  return { 'leased' }
end

outbox.leaseId = ARGV[3]
outbox.leaseExpiresAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(outbox), 'KEEPTTL')
redis.call('ZADD', KEYS[2], ARGV[5], ARGV[1])
return { 'claimed', cjson.encode(outbox) }
