const core = require('@actions/core');
const { shell, powershell, cmd } = require('./shell.js');
import * as os from 'os';

async function install_linux() {
    await shell(`
    curl --proto '=https' --tlsv1.2 -sSf https://edgeguard-app.s3.us-west-1.amazonaws.com/linux/install.sh | sudo bash
    `)
}

async function login_linux(token) {
    await shell(`egctl advanced token-login ${token}`)
}

async function status_linux() {
    await shell(`egctl status`)
}

async function install_windows(token, release_channel) {
    await powershell(`
        $url = "https://letsencrypt.org/certs/isrgrootx1.der"
        $filePath = "C:\\isrgrootx1.der"

        try {
            Invoke-WebRequest -Uri $url -OutFile $filePath
            Write-Host "File downloaded and saved successfully to $filePath."
        } catch {
            Write-Host "Error downloading the file: $_"
        }

        # Load the certificate into the certificate store
        $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($filePath)

        # Open the Local Machine certificate store
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
        $store.Open("ReadWrite")

        # Check if the certificate already exists in the store
        $existingCertificate = $store.Certificates.Find("FindByThumbprint", $certificate.Thumbprint, $true)

        if ($existingCertificate.Count -eq 0) {
            # Add the certificate to the store
            $store.Add($certificate)
            Write-Host "Certificate installed successfully."
        } else {
            Write-Host "Certificate already exists in the store."
        }

        # Close the certificate store
        $store.Close()
    `)

    await powershell(`
    $directoryPath = "C:\\ProgramData\\EdgeGuardian\\EdgeGuardian"
    $fileName = "environments.json"
    $envs = @(
        @{
            name = "001 prod"
            domain_suffix = "edge-guardian.io"
            echo_ips = @("13.248.203.97", "76.223.84.31")
            api_token = "${token}"
        }
    )

    # Create the directory if it doesn't exist
    if (-not (Test-Path -Path $directoryPath -PathType Container)) {
        try {
            New-Item -Path $directoryPath -ItemType Directory -Force | Out-Null
            Write-Host "Directory created successfully at $directoryPath."
        } catch {
            Write-Host "Error creating the directory: $_"
            return
        }
    }

    # Create the full file path
    $filePath = Join-Path -Path $directoryPath -ChildPath $fileName

    # Write the file contents
    try {
      $envJson = $envs | ConvertTo-Json
      "[$envJson]" | Out-File -FilePath $filePath -Encoding UTF8 -Force
      Write-Host "File created successfully at $filePath."
    } catch {
      Write-Host "Error creating the file: $_"
    }
    `)

    await cmd(`type C:\\ProgramData\\EdgeGuardian\\EdgeGuardian\\environments.json`)

    await powershell(`
    $url = "https://edgeguard-app.s3.us-west-1.amazonaws.com/msi/${release_channel}/EdgeGuardian.${os.arch}.exe"
    $filePath = "C:\\eg-setup.exe"

    try {
        Invoke-WebRequest -Uri $url -OutFile $filePath
        Write-Host "File downloaded and saved successfully to $filePath."
    } catch {
        Write-Host "Error downloading the file: $_"
    }

    Start-Process -FilePath "C:\\eg-setup.exe" -ArgumentList "/silent" -Wait
    `)

    await cmd(`curl localhost:3128/environments`)
    await powershell(`
    $processName = "EdgeGuardian"
    $count = 0

    while (-not (Get-Process -Name $processName -ErrorAction SilentlyContinue)) {
        Start-Sleep -Seconds 2
        $count = $count + 1
        if ($count -gt 30) {
            Exit 1
        }
    }

    Write-Host "Process '$processName' has launched."
    `)
    await cmd(`type C:\\ProgramData\\EdgeGuardian\\EdgeGuardian\\logs\\datapath.log`)
}

async function status_windows() {
    await cmd(`sc query egtunnelservice & sleep 5 & curl localhost:3128/config`)
}

async function main() {
    const token = core.getInput('api_key');
    var release_channel = core.getInput('release_channel');
    if (release_channel === '') {
        release_channel = 'default';
    }
    if (os.platform() == 'win32') {
        await install_windows(token, release_channel);
        await status_windows();
    } else if (os.platform() == 'linux') {
        await install_linux();
        await login_linux(token);
        await status_linux();
    } else {
        let platform = os.platform();
        core.setFailed(`${platform} not supported`);
    }
}

function supportedArch() {
    const supported = ['x64', 'arm64'];
    if (!supported.includes(os.arch())) {
        core.setFailed(`${os.arch()} is not supported`);
        return false;
    }
    return true;
}

try {
    if (supportedArch()) {
        main();
    }
} catch (error) {
    core.saveState("EG_FAILED", "true");
    core.setFailed(error.message);
}
