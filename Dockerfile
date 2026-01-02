# Usa uma imagem leve do Node.js (Alpine Linux)
FROM node:18-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /server

# Copia apenas os arquivos de dependência primeiro (para cache do Docker)
# O asterisco garante que copie o package-lock.json se existir
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o restante do código fonte (server.js, index.html, etc.)
COPY . .

# Expõe a porta que sua aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "server.js"]