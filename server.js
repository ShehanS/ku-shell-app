const net = require('net');
const figlet = require('figlet');
const fs = require('fs');
const path = require('path');

// Add debug mode
const DEBUG = process.env.DEBUG || false;

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

// Telnet protocol constants
const IAC = 255;  // Interpret As Command
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const SB = 250;   // Sub-negotiation Begin
const SE = 240;   // Sub-negotiation End

// Telnet options
const ECHO = 1;
const SGA = 3;    // Suppress Go Ahead
const NAWS = 31;  // Negotiate About Window Size

// Display message slowly, line by line with a delay
function displaySlowly(socket, text, callback, delay = 100) {
    const lines = text.split('\n');
    let lineIndex = 0;
    
    function sendNextLine() {
        if (lineIndex < lines.length) {
            const line = lines[lineIndex];
            socket.write(line + '\r\n');
            lineIndex++;
            setTimeout(sendNextLine, delay);
        } else {
            if (callback) callback();
        }
    }
    
    sendNextLine();
}

// Original Welcome Message
const preLoginMessage = `
********"***************
* WELCOME TO THE ARCHIVE OF yoKgUeWsEhNwIari *
* || * UNAUTHORIZED ACCESS IS PROHIBITED * || *
* Last Modified: June 16, 1994 (05:33 UTC) *
*************************

"For history to remember, someone must first uncover the truth."

If you are reading this, then my mission was not in vain. I worked in shadows,
playing both sides, to learn what should have remained unknown. Here, I have 
hidden fragments of what I discovered—proof of covert operations, stealth
technology, and more.

Somewhere inside these archives lies a path to the truth.
I ask you to find it. Once you discover what's hidden all I ask from you is to 
publish everything you find. Please use any means to make this information 
public and available to all.`;

const server = net.createServer((socket) => {
    socket.write(Buffer.from([IAC, WONT, ECHO]));

// Request the client to Suppress Go Ahead (SGA) for smoother input handling
socket.write(Buffer.from([IAC, DO, SGA]));

// Inform the client that the server will also Suppress Go Ahead
socket.write(Buffer.from([IAC, WILL, SGA]));

// Inform the client that the server will negotiate window size (NAWS)
socket.write(Buffer.from([IAC, WILL, NAWS]));

// Ensure the client does NOT echo characters to prevent double input
socket.write(Buffer.from([IAC, DO, ECHO]));
    
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    let username = '';
    let authenticated = false;
    let currentDir = '/';
    let inputBuffer = '';
    let terminalWidth = 80; // Default terminal width
    let terminalHeight = 24; // Default terminal height
    
    // Handle telnet protocol negotiation
    socket.on('data', handleTelnetData);
    
    logActivity(`New connection from ${clientAddress}`);
    
    // Display the welcome message line by line with a delay
    displaySlowly(socket, preLoginMessage, () => {
        // After all lines have been displayed, show the login prompt
        socket.write('\r\nPlease enter your username: ');
    }, 150); // 150ms delay between lines

    let awaitingUsername = true;
    let awaitingPassword = false;
    let hideInput = false;

function handleTelnetData(socket, data) {
    if (!data || !Buffer.isBuffer(data)) {
        console.error("Received invalid data:", data);
        return;
    }

    for (let i = 0; i < data.length; i++) {
        const char = data[i];

        if (char === 8 || char === 127) { // Handle Backspace (BS = 8, DEL = 127)
            if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                socket.write('\b \b'); // Move back, erase character, move back again
            }
            continue;
        }

        if (char === 13) { // Enter key
            processCommand(inputBuffer, socket);
            inputBuffer = "";
            socket.write("\r\n> "); // Show prompt again
            continue;
        }

        inputBuffer += String.fromCharCode(char); // Append character to inputBuffer
        socket.write(String.fromCharCode(char));  // Echo the character back
    }
}



    function processInput(input) {
        if (awaitingUsername) {
            if (input) {
                username = input.toUpperCase(); // Convert to uppercase to match validCredentials
                awaitingUsername = false;
                awaitingPassword = true;
                hideInput = true;

                logActivity(`Login attempt: Username '${username}' provided from ${clientAddress}`);

                if (validCredentials[username]) {
                    socket.write('Password: ');
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

        switch(command) {
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
