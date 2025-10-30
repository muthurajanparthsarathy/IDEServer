# Base Node image
FROM node:18

# Install Python inside container
RUN apt-get update && apt-get install -y python3 python3-pip

# Working directory
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install deps
RUN npm install

# Copy rest of code
COPY . .

# Open backend port
EXPOSE 8080

# Start server
CMD ["npm", "start"]
