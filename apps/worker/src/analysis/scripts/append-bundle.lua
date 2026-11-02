local analysisPayload = redis.call('GET', KEYS[1])
local provisionalPayload = redis.call('GET', KEYS[2])
if not analysisPayload or not provisionalPayload then return { 'dependency_unavailable' } end
local analysis = cjson.decode(analysisPayload)
if analysis.status ~= 'running' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end
local provisional = cjson.decode(provisionalPayload)
for _, artifact in ipairs(provisional.artifacts) do
  if artifact.kind == 'result-bundle' then return { 'updated', provisionalPayload } end
end
provisional.artifacts[#provisional.artifacts + 1] = cjson.decode(ARGV[3])
redis.call('SET', KEYS[2], cjson.encode(provisional), 'KEEPTTL')
return { 'updated', cjson.encode(provisional) }
