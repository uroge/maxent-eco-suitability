local payload = redis.call('GET', KEYS[1])
if not payload then return { 'dependency_unavailable' } end
local analysis = cjson.decode(payload)
if analysis.status ~= 'running' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end
analysis.mapAssets = cjson.decode(ARGV[3])
analysis.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated' }
