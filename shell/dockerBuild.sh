echo "Building Zeleena Fashions"

# Go up to the parent directory if needed
cd ..

# Run Docker with .env file from root
docker build -t zeleenafashions .

docker run --env-file .env -p 3000:3000 zeleenafashions

