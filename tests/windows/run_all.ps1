Param()
$node = if ($env:NODE_CMD) { $env:NODE_CMD } else { 'node' }
Write-Host "Running Node test runner with $node ..."
& $node "./tests/node/run_all.js"
