pipeline {
    agent any

    options { timestamps() }

    environment {
        REMOTE_HOST        = '13.232.166.213'
        REMOTE_USER        = 'ubuntu'
        APP_DIR            = '/home/ubuntu/whatsapp-bot'
        CONFIG_REPO        = 'git@github.com:VahanInc/config-files.git'
        CONFIG_REPO_BRANCH = 'dev'
        CONFIG_ENV_PATH    = 'JobFinder/staging/config'
        SSH_KEY_PATH       = "${HOME}/.ssh/config-files"
        EC2_SSH_KEY        = "${HOME}/.ssh/id_rsa"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Fetch Configs') {
            steps {
                sh '''#!/bin/bash
set -euo pipefail
rm -rf /tmp/config-files
git -c core.sshCommand="ssh -i ${SSH_KEY_PATH} -o IdentitiesOnly=yes" \
    clone --depth=1 --branch ${CONFIG_REPO_BRANCH} ${CONFIG_REPO} /tmp/config-files
cp /tmp/config-files/${CONFIG_ENV_PATH}/.env .env
rm -rf /tmp/config-files
'''
            }
        }

        stage('Deploy') {
            steps {
                sh '''#!/bin/bash
set -euo pipefail
SSH_OPTS="-i ${EC2_SSH_KEY} -o StrictHostKeyChecking=no"

ssh ${SSH_OPTS} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${APP_DIR}"

rsync -avz --delete \
    --exclude node_modules \
    --exclude .git \
    -e "ssh ${SSH_OPTS}" \
    ./ ${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/
'''
            }
        }

        stage('Start') {
            steps {
                sh '''#!/bin/bash
set -euo pipefail
SSH_OPTS="-i ${EC2_SSH_KEY} -o StrictHostKeyChecking=no"

ssh ${SSH_OPTS} ${REMOTE_USER}@${REMOTE_HOST} "
    cd ${APP_DIR} &&
    npm install --production &&
    pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js
"
'''
            }
        }

        stage('Health Check') {
            steps {
                sh '''#!/bin/bash
sleep 5
SSH_OPTS="-i ${EC2_SSH_KEY} -o StrictHostKeyChecking=no"

ssh ${SSH_OPTS} ${REMOTE_USER}@${REMOTE_HOST} "
    pm2 status &&
    curl -sf http://localhost:3000/health
"
'''
            }
        }
    }

    post {
        failure {
            echo 'Deployment failed!'
        }
        success {
            echo 'Deployed successfully!'
        }
    }
}
