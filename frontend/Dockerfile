# Use an official Node.js runtime as the base image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package management configuration files first
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the React application source code
COPY . .

# Expose the port React runs on (typically 3000)
EXPOSE 3000

# Start the React development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
