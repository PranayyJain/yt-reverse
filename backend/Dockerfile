FROM node:18-bullseye-slim

# Install ffmpeg and python3 (required for yt-dlp)
RUN apt-get update && \
    apt-get install -y ffmpeg python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package info
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
