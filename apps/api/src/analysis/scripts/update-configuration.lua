local existing = redis.call('GET', KEYS[2])
if existing then
  local replay = cjson.decode(existing)
  if replay.fingerprint == ARGV[3] then return { 'replay', replay.response } end
  return { 'idempotency_conflict' }
end
local payload = redis.call('GET', KEYS[1])
if not payload then return { 'missing' } end
local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then return { 'missing' } end
if analysis.status ~= 'ready' then return { 'invalid' } end
local revision = analysis.configurationRevision or 0
if revision ~= tonumber(ARGV[2]) then return { 'conflict' } end
analysis.configuration = cjson.decode(ARGV[4])
analysis.configurationRevision = revision + 1
analysis.configurationFingerprint = ARGV[3]
analysis.updatedAt = ARGV[5]
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
local response = cjson.encode(analysis)
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then redis.call('SET', KEYS[2], cjson.encode({ fingerprint = ARGV[3], response = response }), 'PX', ttl) end
return { 'updated', response }
