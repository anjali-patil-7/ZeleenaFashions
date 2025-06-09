# Use a lightweight Node.js base image
FROM node:23.1.0-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy only the package files first to install dependencies
COPY package*.json ./


# Install only production dependencies
RUN npm install --silent --production

# Copy the rest of the application source code into the container
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the app using the start script from package.json
CMD ["npm", "start"]
