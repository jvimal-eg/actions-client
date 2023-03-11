const core = require('@actions/core');
const { shell } = require('./shell');

try {
    shell('egctl logout')
} catch (error) {
    core.setFailed(error.message);
}
