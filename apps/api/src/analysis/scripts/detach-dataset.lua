local analysisPayload = redis.call('GET', KEYS[1])
if not analysisPayload then return { 'missing' } end

local analysis = cjson.decode(analysisPayload)
if analysis.ownerId ~= ARGV[1] then return { 'missing' } end
if analysis.status ~= 'uploading' and analysis.status ~= 'ready' then
  return { 'invalid' }
end

local manifestPayload = redis.call('GET', KEYS[2])
if not manifestPayload then return { 'missing' } end
local manifest = cjson.decode(manifestPayload)
local retained = {}
local removed = nil
for _, entry in ipairs(manifest.datasets) do
  if entry.dataset.id == ARGV[2] then
    removed = entry
  else
    retained[#retained + 1] = entry
  end
end
if removed == nil then return { 'missing' } end

manifest.datasets = retained
analysis.status = 'uploading'
analysis.inputRevision = (analysis.inputRevision or 0) + 1
analysis.configuration = nil
analysis.configurationRevision = 0
analysis.configurationFingerprint = nil
analysis.inputProfile = nil
analysis.preflight = nil
analysis.updatedAt = ARGV[3]
if removed.dataset.kind == 'occurrence' then analysis.occurrenceDatasetId = nil end

redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
redis.call('SET', KEYS[2], cjson.encode(manifest), 'KEEPTTL')
return { 'removed', cjson.encode(removed) }
