function displaySlowly(socket, text, callback, delay = 100, typewriterEffect = false) {
    const lines = text.split('\n');
    let lineIndex = 0;

    function sendNextLine() {
        if (lineIndex < lines.length) {
            const line = lines[lineIndex];
            if (typewriterEffect) {
                displayWithTypewriterEffect(line, () => {
                    lineIndex++;
                    setTimeout(sendNextLine, delay);
                });
            } else {
                socket.write(line + '\r\n');
                lineIndex++;
                setTimeout(sendNextLine, delay);
            }
        } else {
            if (callback) callback();
        }
    }

    function displayWithTypewriterEffect(line, onComplete) {
        let charIndex = 0;
        const typewriterEffectDelay = 40;
        function typeNextChar() {
            if (charIndex < line.length) {
                socket.write(line[charIndex]);
                charIndex++;
                setTimeout(typeNextChar, typewriterEffectDelay);
            } else {
                socket.write('\r\n');
                if (onComplete) onComplete();
            }
        }

        typeNextChar();
    }

    sendNextLine();
}

const figlet = require('figlet');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8023;
const clients = new Map();

const validCredentials = {
    'YOGESHWARI': 'WEAREONE'
};

const LOG_DIR = path.join(__dirname, 'logs');
const ACCESS_LOG_FILE = path.join(LOG_DIR, 'access.log');

if (!fs.existsSync(LOG_DIR)) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        console.log(`Created log directory at: ${LOG_DIR}`);
    } catch (err) {
        console.error(`Error creating log directory: ${err.message}`);
    }
}

function logActivity(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    console.log(logEntry.trim());

    fs.appendFile(ACCESS_LOG_FILE, logEntry, (err) => {
        if (err) {
            console.error(`Error writing to log file: ${err.message}`);
        }
    });
}

const ROOT_DIR = path.join(__dirname, 'root');

if (!fs.existsSync(ROOT_DIR)) {
    try {
        fs.mkdirSync(ROOT_DIR, { recursive: true });
        logActivity(`Created root directory at: ${ROOT_DIR}`);
    } catch (err) {
        logActivity(`Error creating root directory: ${err.message}`);
    }
}

const server = net.createServer((socket) => {

    // socket.write(Buffer.from([255, 251, 1])); // IAC WILL ECHO
    // socket.write(Buffer.from([255, 254, 1])); // IAC DONT ECHO

    // Negotiate about window size (NAWS)
    socket.write(Buffer.from([255, 251, 31])); // IAC WILL NAWS

    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    let username = '';
    let authenticated = false;
    let currentDir = '/';
    let inputBuffer = '';
    let terminalWidth = 80;

    socket.on('data', handleTelnetData);

    logActivity(`New connection from ${clientAddress}`);

    // title init
    const title = figlet.textSync('yoKgUeWsEhNwIari', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
    });

    // welcome title, subtitle and last modified date
    const subtitle = '\x1b[1m\x1b[31m-- UNAUTHORIZED ACCESS IS PROHIBITED --\x1b[0m';
    const lastModified = '\x1b[1m\x1b[34mLast Modified: October 16, 1994 (05:33 UTC)\x1b[0m';

    const retroText = `
"For the truth to be remembered, someone must first find it"
`;

    // retro text into lines
    const retroTextLines = retroText.trim().split('\n');

    // Calculate the maximum width for the grid
    const maxTitleWidth = Math.max(...title.split('\n').map(line => line.length));
    const maxRetroTextWidth = Math.max(...retroTextLines.map(line => line.length));
    const maxLineWidth = Math.max(maxTitleWidth, maxRetroTextWidth, subtitle.length, lastModified.length);
    const gridWidth = maxLineWidth + 6; // padding for the grid

    // strip ANSI escape sequences
    function stripAnsiCodes(text) {
        return text.replace(/\x1b\[[0-9;]*m/g, '');
    }

    // visible length of the subtitle and last modified text
    const visibleSubtitleLength = stripAnsiCodes(subtitle).length;
    const visibleLastModifiedLength = stripAnsiCodes(lastModified).length;

    // Center-align the title
    const centeredTitle = title.split('\n').map(line => {
        const padding = Math.floor((gridWidth - line.length) / 2);
        return `${' '.repeat(padding)}\x1b[32m${line}\x1b[0m${' '.repeat(gridWidth - line.length - padding)}`;
    }).join('\n');

    // Center-align the subtitle and last modified text
    const centeredSubtitle = `${' '.repeat(Math.floor((gridWidth - visibleSubtitleLength) / 2))}${subtitle}${' '.repeat(Math.ceil((gridWidth - visibleSubtitleLength) / 2))}`;
    const centeredLastModified = `${' '.repeat(Math.floor((gridWidth - visibleLastModifiedLength) / 2))}${lastModified}${' '.repeat(Math.ceil((gridWidth - visibleLastModifiedLength) / 2))}`;

    // Center-align the retro text
    const centeredRetroText = retroTextLines.map(line => {
        const padding = Math.floor((gridWidth - line.length) / 2);
        return `${' '.repeat(padding)}${line}${' '.repeat(gridWidth - line.length - padding)}`;
    }).join('\n');

    displaySlowly(socket, `${centeredTitle}\n\n${centeredSubtitle}\n${centeredLastModified}\n\n`, () => {
        displaySlowly(socket, centeredRetroText, () => {
            socket.write('\r\n\x1b[32mUsername:\x1b[0m ');
        }, 50, false, true);
    }, 150, false, false);

    let awaitingUsername = true;
    let awaitingPassword = false;
    let hideInput = false;

    function handleTelnetData(data) {

        let i = 0;
        while (i < data.length) {

            if (data[i] === 255) { // IAC byte
                if (i + 1 < data.length) {
                    const command = data[i + 1];

                    if (command === 250 && i + 5 < data.length && data[i + 2] === 31) { // SB NAWS
                        // Extract window width (high byte, low byte)
                        const width = (data[i + 3] << 8) + data[i + 4];
                        if (width > 0) {
                            terminalWidth = width;
                            logActivity(`Terminal width for ${username || 'unknown'} set to ${terminalWidth}`);
                        }

                        i += 7;
                        continue;
                    }

                    i += 3;
                    continue;
                }
            }

            if (data[i] === 8 || data[i] === 127) {
                if (inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);

                    socket.write('\b \b');
                }
                i++;
                continue;
            }

            if (data[i] === 13 || data[i] === 10) {
                // Process the completed line
                const input = inputBuffer.trim();
                inputBuffer = '';

                socket.write('\r\n');

                processInput(input);
                i++;
                continue;
            }

            if (data[i] < 32 && data[i] !== 9) {
                i++;
                continue;
            }

            inputBuffer += String.fromCharCode(data[i]);

            if (!hideInput) {
                socket.write(String.fromCharCode(data[i]));
            } else {
                socket.write('*');
            }
            i++;
        }
    }

    function processInput(input) {
        if (awaitingUsername) {
            if (input) {
                username = input;
                awaitingUsername = false;
                awaitingPassword = true;
                hideInput = true;

                logActivity(`Login attempt: Username '${username}' provided from ${clientAddress}`);

                if (validCredentials[username]) {
                    socket.write('\x1b[32mPassword: \x1b[0m');
                } else {
                    logActivity(`Failed login: Invalid username '${username}' from ${clientAddress}`);
                    socket.write('Invalid username. Please try again.\r\n');
                    socket.write('Please enter your username: ');
                    awaitingUsername = true;
                    awaitingPassword = false;
                    hideInput = false;
                }
            }
            return;
        }

        if (awaitingPassword) {
            if (input) {
                const password = input;
                hideInput = false;
                logActivity(`Login attempt: Password provided for user '${username}' from ${clientAddress}`);

                if (validCredentials[username] === password) {
                    authenticated = true;
                    awaitingPassword = false;

                    logActivity(`Successful login: User '${username}' from ${clientAddress}`);

                    clients.set(socket, {
                        username: username,
                        address: clientAddress,
                        currentDir: currentDir,
                        loginTime: new Date()
                    });

                    socket.write(`\r\nHello ${username}! Here are the available commands:\r\n`);

                    displayHelpMenu(socket);
                    sendPrompt(socket);
                } else {
                    logActivity(`Failed login: Incorrect password for user '${username}' from ${clientAddress}`);
                    socket.write('Incorrect password. Please try again.\r\n');
                    socket.write('Please enter your username: ');
                    awaitingUsername = true;
                    awaitingPassword = false;
                    hideInput = false;
                }
            }
            return;
        }

        if (!authenticated) {
            socket.write('Please authenticate first.\r\n');
            return;
        }

        logActivity(`Command executed by '${username}': ${input}`);

        if (!input) {
            sendPrompt(socket);
            return;
        }

        const args = input.split(' ');
        const command = args[0];

        switch (command) {
            case 'help':
                displayHelpMenu(socket);
                break;

            case 'whoami':
                socket.write(`${username}\r\n`);
                break;

            case 'list':
                socket.write('Connected users:\r\n');
                let count = 1;
                clients.forEach((client, clientSocket) => {
                    socket.write(`  ${count}. ${client.username}\r\n`);
                    count++;
                });
                break;

            case 'say':
                const message = args.slice(1).join(' ');
                if (message.trim()) {
                    broadcastMessage(`${username}: ${message}`, socket);
                    logActivity(`Broadcast message from '${username}': ${message}`);
                } else {
                    socket.write('Usage: say [message]\r\n');
                }
                break;

            case 'clear':
                socket.write('\u001B[2J\u001B[0;0f');
                break;

            case 'exit':
                logActivity(`User '${username}' logged out from ${clientAddress}`);
                socket.write('Goodbye!\r\n');
                socket.end();
                return;

            case 'pwd':
                socket.write(`${currentDir}\r\n`);
                break;

            case 'ls':
                handleLsCommand(socket);
                break;

            case 'cd':
                const newDir = args[1] || '';
                handleCdCommand(socket, newDir);
                break;

            case 'cat':
                const fileName = args[1] || '';
                if (!fileName) {
                    socket.write('Usage: cat [filename]\r\n');
                } else {
                    handleCatCommand(socket, fileName);
                }
                break;

            default:
                if (input) {
                    socket.write(`Command not found: ${command}\r\n`);
                }
        }

        sendPrompt(socket);
    }

    function displayHelpMenu(socket) {
        socket.write('Available commands:\r\n');
        socket.write('  help         - Show this help message\r\n');
        socket.write('  whoami       - Display your username\r\n');
        socket.write('  list         - Show connected users\r\n');
        socket.write('  say [msg]    - Send a message to all users\r\n');
        socket.write('  clear        - Clear the screen\r\n');
        socket.write('  exit         - Disconnect from server\r\n');
        socket.write('\r\nFile System Commands:\r\n');
        socket.write('  pwd          - Print working directory\r\n');
        socket.write('  ls           - List files in current directory\r\n');
        socket.write('  cd [dir]     - Change directory\r\n');
        socket.write('  cat [file]   - View file contents\r\n');
    }

    function handleLsCommand(socket) {
        try {
            const physicalPath = getPhysicalPath(currentDir);
            const items = fs.readdirSync(physicalPath);

            const colorDir = '\x1b[36m';
            const colorFile = '\x1b[37m';
            const colorReset = '\x1b[0m';

            if (items.length === 0) {
                socket.write('Directory is empty\r\n');
                return;
            }

            socket.write('\r\n');
            for (const item of items) {
                const itemPath = path.join(physicalPath, item);
                const stats = fs.statSync(itemPath);
                const isDirectory = stats.isDirectory();

                const dateStr = stats.mtime.toLocaleString().padEnd(20);
                const sizeStr = String(stats.size).padStart(10);
                const perms = isDirectory ? 'drwxr-xr-x' : '-rw-r--r--';

                const color = isDirectory ? colorDir : colorFile;
                const suffix = isDirectory ? '/' : '';

                socket.write(`${perms} ${sizeStr} ${dateStr} ${color}${item}${suffix}${colorReset}\r\n`);
            }

            logActivity(`User '${username}' listed directory '${currentDir}'`);
        } catch (err) {
            logActivity(`Error for user '${username}' listing directory '${currentDir}': ${err.message}`);
            socket.write(`Error listing directory: ${err.message}\r\n`);
        }
    }

    function handleCdCommand(socket, dir) {
        try {
            const originalDir = currentDir;

            if (dir === '..') {
                if (currentDir === '/') {
                    socket.write('Already at root directory\r\n');
                    return;
                }

                const parts = currentDir.split('/').filter(Boolean);
                parts.pop();
                currentDir = parts.length ? '/' + parts.join('/') : '/';
            } else if (dir.startsWith('/')) {
                currentDir = dir;
            } else if (dir) {
                if (currentDir === '/') {
                    currentDir = '/' + dir;
                } else {
                    currentDir = `${currentDir}/${dir}`;
                }
            } else {
                currentDir = '/';
            }

            currentDir = '/' + currentDir.split('/').filter(Boolean).join('/');

            const physicalPath = getPhysicalPath(currentDir);
            if (!fs.existsSync(physicalPath) || !fs.statSync(physicalPath).isDirectory()) {
                logActivity(`User '${username}' failed to change directory to '${dir}': Directory not found`);
                socket.write(`cd: ${dir}: No such directory\r\n`);
                currentDir = originalDir;
                return;
            }

            logActivity(`User '${username}' changed directory from '${originalDir}' to '${currentDir}'`);

            const clientData = clients.get(socket);
            if (clientData) {
                clientData.currentDir = currentDir;
                clients.set(socket, clientData);
            }
        } catch (err) {
            logActivity(`Error for user '${username}' changing directory to '${dir}': ${err.message}`);
            socket.write(`Error changing directory: ${err.message}\r\n`);
        }
    }

    function handleCatCommand(socket, fileName) {
        try {
            const filePath = path.join(getPhysicalPath(currentDir), fileName);

            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                logActivity(`User '${username}' attempted to view non-existent file '${fileName}' in '${currentDir}'`);
                socket.write(`cat: ${fileName}: No such file\r\n`);
                return;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            socket.write(`\r\n${content}\r\n`);

            logActivity(`User '${username}' viewed file '${fileName}' in directory '${currentDir}'`);
        } catch (err) {
            logActivity(`Error for user '${username}' reading file '${fileName}': ${err.message}`);
            socket.write(`Error reading file: ${err.message}\r\n`);
        }
    }

    function getPhysicalPath(virtualPath) {
        const parts = virtualPath.split('/').filter(Boolean);
        return path.join(ROOT_DIR, ...parts);
    }

    socket.on('error', (err) => {
        logActivity(`Socket error for user '${username}' (${clientAddress}): ${err.message}`);
    });

    socket.on('close', () => {
        logActivity(`Connection closed: User '${username}' (${clientAddress})`);
        clients.delete(socket);
    });

    function sendPrompt(socket) {
        const dirDisplay = currentDir === '/' ? '/' : currentDir;
        socket.write(`\r\n${username}:${dirDisplay}$ `);
    }

    function broadcastMessage(message, senderSocket) {
        clients.forEach((client, clientSocket) => {
            if (clientSocket !== senderSocket) {
                clientSocket.write(`\r\n${message}\r\n`);
                sendPrompt(clientSocket);
            }
        });
    }
});

server.listen(PORT, () => {
    logActivity(`Telnet server started on port ${PORT}`);
    logActivity(`File system root directory: ${ROOT_DIR}`);
    logActivity(`Log file location: ${ACCESS_LOG_FILE}`);
    console.log('Press Ctrl+C to stop the server');
});

process.on('SIGINT', () => {
    logActivity('Server shutting down...');

    clients.forEach((client, socket) => {
        socket.end('Server is shutting down. Goodbye!\r\n');
        logActivity(`Disconnecting user '${client.username}' due to server shutdown`);
    });

    server.close(() => {
        logActivity('Server shutdown complete');
        process.exit(0);
    });
});
