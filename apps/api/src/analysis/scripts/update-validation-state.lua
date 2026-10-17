local payload = redis.call('GET', KEYS[1])
if not payload then return { 'missing' } end
local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then return { 'missing' } end
if (analysis.inputRevision or 0) ~= tonumber(ARGV[3]) then return { 'stale' } end
if ARGV[2] == 'preflight' and (analysis.configurationRevision or 0) ~= tonumber(ARGV[4]) then
  return { 'stale' }
end
analysis[ARGV[2]] = cjson.decode(ARGV[5])
analysis.updatedAt = ARGV[6]
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated', cjson.encode(analysis) }
