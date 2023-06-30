const core = require('@actions/core');
const { shell } = require('./shell.js');

if (core.getState("EG_FAILED") == "true") {
    if (core.getInput('submit_diagnostics_on_failure') == "true") {
        try {
            shell('egctl advanced log-upload');
        } catch (error) { }
    }
    try {
        shell('cat /var/log/edgeguardian/datapath.log || true;')
    } catch (error) { }
}

try {
    shell('egctl logout');
} catch (error) {
    core.setFailed(error.message);
}
