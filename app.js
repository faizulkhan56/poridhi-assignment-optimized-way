const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Use body-parser to parse JSON bodies into JS objects
app.use(bodyParser.json());

// Basic authentication middleware
const basicAuth = (req, res, next) => {
    const auth = { login: 'admin', password: 'password' }; // Change this to your desired login and password

    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === auth.login && password === auth.password) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Authentication required.');
};

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const auth = { login: 'admin', password: 'password' }; // Change this to your desired login and password

    if (username === auth.login && password === auth.password) {
        res.status(200).send('Login successful');
    } else {
        res.status(401).send('Login failed');
    }
});

// Apply basic authentication to the /upload endpoint
app.post('/upload', basicAuth, upload.single('videoFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, 'uploads', req.file.originalname);

    fs.rename(tempPath, targetPath, err => {
        if (err) return res.status(500).send('Error moving the file.');

        const outputDir = path.join(__dirname, 'video');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }

        // Update ffmpeg command to output all files to the video directory
        const command = `ffmpeg -i ${targetPath} -map 0 -b:v 2400k -s:v 1920x1080 -c:v libx264 -f dash ${path.join(outputDir, 'video.mpd')} -init_seg_name ${path.join(outputDir, 'init-stream0.m4s')} -media_seg_name ${path.join(outputDir, 'chunk-stream0-%05d.m4s')}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error converting video: ${error.message}`);
                return res.status(500).send('Error converting the video.');
            }
            if (stderr) {
                console.error(`ffmpeg stderr: ${stderr}`);
            }
            console.log(`ffmpeg stdout: ${stdout}`);

            // Read the generated video.mpd file
            const mpdFilePath = path.join(outputDir, 'video.mpd');
            fs.readFile(mpdFilePath, 'utf8', (readErr, data) => {
                if (readErr) {
                    console.error(`Error reading video.mpd: ${readErr}`);
                    return res.status(500).send('Error reading video.mpd');
                }
                // Add the BaseURL line to the MPD file
                const baseURLLine = '<BaseURL>http://localhost:3000/video/</BaseURL>';
                const modifiedData = data.replace('</Period>', `</Period>\n\t${baseURLLine}`);
                // Send the modified MPD file as the response
                res.send(modifiedData);
            });
        });
    });
});

// Serve the DASH manifest file
app.get('/video.mpd', (req, res) => {
    console.log("called for mpd");
    const filePath = path.join(__dirname, 'video', 'video.mpd');
    res.sendFile(filePath);
});

// Serve the DASH segment files
app.get('/video/:segment', (req, res) => {
    console.log("called segment");
    const segment = req.params.segment;
    const filePath = path.join(__dirname, 'video', segment);
    res.sendFile(filePath);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
