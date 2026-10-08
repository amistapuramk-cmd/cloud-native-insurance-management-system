# Cloud-Native Insurance Management System

A simple base project built as small, independently deployable microservices.

```
Client -> api-gateway (8080) -> customer-service
                             -> policy-service  -> customer-service (validates customer)
                             -> claim-service   -> policy-service   (validates policy)
```

| Service | Responsibility |
|---|---|
| api-gateway | Single public entry point, routes /api/* to the services |
| customer-service | Register and look up customers |
| policy-service | Premium calculation, issue and list policies |
| claim-service | File claims, approve or reject them |

## Cloud-native features included
- Each service is a separate container (Dockerfile per service, non-root user)
- Configuration through environment variables (12-factor)
- `/health` endpoint on every service, used by Kubernetes readiness and liveness probes
- Structured JSON logs to stdout
- Graceful shutdown on SIGTERM
- Stateless services, so they can scale horizontally (2 replicas + autoscaler in `k8s/`)
- Service-to-service calls with failure handling (503 / 502 when a dependency is down)

## Option 1: run locally (Node.js 18+)
Open four terminals, run `npm install` in each service folder, then:

```
PORT=3001 node customer-service/server.js
PORT=3002 node policy-service/server.js
PORT=3003 node claim-service/server.js
PORT=8080 node api-gateway/server.js
```

## Option 2: Docker Compose
```
docker compose up --build
```
The gateway is then available on http://localhost:8080.

## Option 3: Kubernetes (minikube / kind / cloud cluster)
```
docker build -t insurance/customer-service:1.0 ./customer-service
docker build -t insurance/policy-service:1.0   ./policy-service
docker build -t insurance/claim-service:1.0    ./claim-service
docker build -t insurance/api-gateway:1.0      ./api-gateway
kubectl apply -f k8s/insurance-system.yaml
kubectl get pods
```
(On minikube load the images first with `minikube image load <image>`.)

## Try the API
```
curl -X POST localhost:8080/api/customers -H "Content-Type: application/json" \
  -d '{"name":"Ravi Kumar","email":"ravi@example.com","phone":"9999999999"}'

curl -X POST localhost:8080/api/policies -H "Content-Type: application/json" \
  -d '{"customerId":"C1","type":"health","age":35,"coverAmount":500000}'

curl -X POST localhost:8080/api/claims -H "Content-Type: application/json" \
  -d '{"policyId":"P1","amount":40000,"description":"Hospital stay"}'

curl -X PATCH localhost:8080/api/claims/CL1/status -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}'
```

| Method | Path | Purpose |
|---|---|---|
| POST / GET | /api/customers, /api/customers/:id | Create / list / get customers |
| GET | /api/policies/plans | Available plans |
| POST / GET | /api/policies, /api/policies/:id | Issue / list / get policies (`?customerId=`) |
| POST / GET | /api/claims, /api/claims/:id | File / list / get claims (`?policyId=`) |
| PATCH | /api/claims/:id/status | APPROVED, REJECTED or SUBMITTED |

## Next steps
- Replace the in-memory stores with PostgreSQL or MongoDB (one database per service)
- Add authentication (JWT) at the gateway
- Add a message broker (Kafka or RabbitMQ) for events such as "claim approved"
- Add CI/CD, metrics (Prometheus) and tracing (OpenTelemetry)
