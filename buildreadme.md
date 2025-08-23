docker build -f Dockerfile.dev  -t my-new-sveltekit-app .

docker run -p 8080:8080  my-new-sveltekit-app
