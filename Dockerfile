FROM node:22-alpine AS web-build

WORKDIR /src
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci
COPY web ./web
RUN npm --prefix web run build

FROM golang:1.24-alpine AS binary-build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY ui/embed.go ./ui/embed.go
COPY --from=web-build /src/ui/dist ./ui/dist
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_TIME=unknown
RUN CGO_ENABLED=0 go build -trimpath -buildvcs=false \
  -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
  -o /out/navi ./cmd/navi
RUN mkdir -p /out/data && chmod 0750 /out/data

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --chown=65532:65532 --from=binary-build /out/navi /app/navi
COPY --chown=65532:65532 --from=binary-build /out/data /data
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/app/navi"]
