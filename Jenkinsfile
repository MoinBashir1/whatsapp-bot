pipeline {
    agent any

    environment {
        REMOTE_HOST        = '13.232.166.213'
        REMOTE_USER        = 'ubuntu'
        APP_DIR            = '/home/ubuntu/whatsapp-bot'
        CONFIG_REPO        = 'git@github.com:VahanInc/config-files.git'
        CONFIG_REPO_BRANCH = 'dev'
        CONFIG_ENV_PATH    = 'JobFinder/staging/config'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Fetch Configs') {
            steps {
                sh """
                    #!/bin/bash
                    set -e
                    rm -rf /tmp/config-files
                    git -c core.sshCommand="ssh -i \${HOME}/.ssh/config-files -o IdentitiesOnly=yes" \
                        clone --depth=1 --branch ${CONFIG_REPO_BRANCH} ${CONFIG_REPO} /tmp/config-files
                    cp /tmp/config-files/${CONFIG_ENV_PATH}/.env .env
                    rm -rf /tmp/config-files
                """
            }
        }

        stage('Deploy') {
            steps {
                sshagent(credentials: ['whatsapp-bot-server-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} '
                            mkdir -p ${APP_DIR}
                        '

                        rsync -avz --delete \
                            --exclude node_modules \
                            --exclude .git \
                            -e "ssh -o StrictHostKeyChecking=no" \
                            ./ ${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/
                    """
                }
            }
        }

        stage('Start') {
            steps {
                sshagent(credentials: ['whatsapp-bot-server-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} '
                            cd ${APP_DIR} &&
                            npm install --production &&
                            pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js
                        '
                    """
                }
            }
        }

        stage('Health Check') {
            steps {
                sshagent(credentials: ['whatsapp-bot-server-key']) {
                    sh """
                        sleep 5
                        ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} '
                            pm2 status &&
                            curl -sf http://localhost:3000/health
                        '
                    """
                }
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
