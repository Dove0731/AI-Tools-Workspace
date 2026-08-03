$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$connectorDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$credentialPath = Join-Path $connectorDir 'credential.clixml'
$username = ([string]([char]0x66FE) + [char]0x5FB7 + [char]0x709C)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Kingdee MCP Credential'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(430, 215)
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$accountLabel = New-Object System.Windows.Forms.Label
$accountLabel.Location = New-Object System.Drawing.Point(25, 22)
$accountLabel.Size = New-Object System.Drawing.Size(365, 25)
$accountLabel.Text = "Account: $username"
$form.Controls.Add($accountLabel)

$passwordLabel = New-Object System.Windows.Forms.Label
$passwordLabel.Location = New-Object System.Drawing.Point(25, 57)
$passwordLabel.Size = New-Object System.Drawing.Size(90, 25)
$passwordLabel.Text = 'Password:'
$form.Controls.Add($passwordLabel)

$passwordBox = New-Object System.Windows.Forms.TextBox
$passwordBox.Location = New-Object System.Drawing.Point(115, 54)
$passwordBox.Size = New-Object System.Drawing.Size(275, 25)
$passwordBox.UseSystemPasswordChar = $true
$form.Controls.Add($passwordBox)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(25, 92)
$statusLabel.Size = New-Object System.Drawing.Size(365, 25)
$statusLabel.Text = 'The password will be encrypted for the current Windows user.'
$form.Controls.Add($statusLabel)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Location = New-Object System.Drawing.Point(215, 125)
$saveButton.Size = New-Object System.Drawing.Size(85, 30)
$saveButton.Text = 'Save'
$saveButton.Add_Click({
    if ([string]::IsNullOrWhiteSpace($passwordBox.Text)) {
        [System.Windows.Forms.MessageBox]::Show(
            'Password is required.',
            'Kingdee MCP',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    $securePassword = ConvertTo-SecureString $passwordBox.Text -AsPlainText -Force
    $credential = New-Object System.Management.Automation.PSCredential($username, $securePassword)
    $credential | Export-Clixml -LiteralPath $credentialPath -Force
    $passwordBox.Clear()
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})
$form.Controls.Add($saveButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(305, 125)
$cancelButton.Size = New-Object System.Drawing.Size(85, 30)
$cancelButton.Text = 'Cancel'
$cancelButton.Add_Click({
    $passwordBox.Clear()
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Close()
})
$form.Controls.Add($cancelButton)

$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton
$form.Add_Shown({ $passwordBox.Focus() })

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    exit 2
}
