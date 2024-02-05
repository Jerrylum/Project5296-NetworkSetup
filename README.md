## Setup AWS IAM

1. Create a new user in the AWS IAM console.
2. Attach the `AmazonEC2FullAccess` and `AmazonVPCFullAccess` policies to the user.
3. Create a new access key for the user and save the `Access key ID` and `Secret access key`.

## Setup .env File

Create a `.env` file in the root of the project with the following content:

```env
AWS_REGION=ap-east-1
AWS_ACCESS_KEY_ID=????
AWS_SECRET_ACCESS_KEY=????
INSTANCE_KEY_PAIR_ID=????
```

The `AWS_REGION` is the region where all the resources will be created.

The `AWS_ACCESS_KEY_ID` and `AWS_SECRET` are the credentials of the user created in the first step.

The `INSTANCE_KEY_PAIR_ID` is the id of the key pair that will be used to connect to the EC2 instances.

## Build & Run

1. Copy the contents of the `.env.example` file to a `.env` next to it, and edit it with your values.
2. Run `yarn build` or `npm build` to build the files.
3. Run `yarn start` or `npm start` to start the application.

-   You can run `yarn dev` or `npm dev` to combine the 2 steps above, while listening to changes and restarting automatically.

## Run with Docker

1. Build:

    ```
    docker build -t my-app .
    ```

    Replacing `my-app` with the image name.

2. Run
    ```
    docker run -d -p 3000:3000 my-app
    ```
    Replacing `my-app` with the image name, and `3000:3000` with the `host:container` ports to publish.

## Developing

### Visual Studio Code

-   Installing the Eslint (`dbaeumer.vscode-eslint`) and Prettier - Code formatter (`esbenp.prettier-vscode`) extensions is recommended.

## Linting & Formatting

-   Run `yarn lint` or `npm lint` to lint the code.
-   Run `yarn format` or `npm format` to format the code.

## Testing

-   Run `yarn test` or `npm test` to execute all tests.
-   Run `yarn test:watch` or `npm test:watch` to run tests in watch (loop) mode.
-   Run `yarn test:coverage` or `npm test:coverage` to see the tests coverage report.
