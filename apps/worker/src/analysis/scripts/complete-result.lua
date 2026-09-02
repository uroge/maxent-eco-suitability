local analysisPayload = redis.call('GET', KEYS[1])
local provisionalPayload = redis.call('GET', KEYS[2])
if not analysisPayload or not provisionalPayload then
  return { 'dependency_unavailable' }
end

local analysis = cjson.decode(analysisPayload)
if analysis.status == 'cancelling' or analysis.status == 'cancelled' then
  return { 'cancelled' }
end
if analysis.status ~= 'running' or type(analysis.execution) ~= 'table' or analysis.execution.jobId ~= ARGV[1] or analysis.execution.attempt ~= tonumber(ARGV[2]) then
  return { 'stale_attempt' }
end

local provisional = cjson.decode(provisionalPayload)
if provisional.publicationState == 'verified' then
  return { 'ready', cjson.encode(provisional) }
end
provisional.candidateCompletedAt = provisional.candidateCompletedAt or ARGV[3]
provisional.publicationState = 'uploading'
redis.call('SET', KEYS[2], cjson.encode(provisional), 'KEEPTTL')
return { 'ready', cjson.encode(provisional) }
