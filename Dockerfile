# Use an official Node.js runtime as a parent image
FROM node:18-slim AS build

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY ../package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY .. .

# Build the React app
RUN npm run build

# Use an official NGINX image to serve the build
FROM nginx:stable-alpine

# Copy the built React app from the previous stage to the NGINX directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose the default NGINX port
EXPOSE 8965

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
