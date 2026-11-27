local analysisPayload = redis.call('GET', KEYS[1])
local provisionalPayload = redis.call('GET', KEYS[2])
if not analysisPayload or not provisionalPayload then return { 'dependency_unavailable' } end
local analysis = cjson.decode(analysisPayload)
if analysis.status == 'cancelling' or analysis.status == 'cancelled' then
  return { 'cancelled' }
end
if analysis.status ~= 'running' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end
local provisional = cjson.decode(provisionalPayload)
local index = #provisional.artifacts + 1
for i, artifact in ipairs(provisional.artifacts) do
  if artifact.kind == 'result-bundle' then
    index = i
    break
  end
end
provisional.artifacts[index] = cjson.decode(ARGV[3])
redis.call('SET', KEYS[2], cjson.encode(provisional), 'KEEPTTL')
return { 'updated', cjson.encode(provisional) }
