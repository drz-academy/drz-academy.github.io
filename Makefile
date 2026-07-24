.PHONY: help build cursos pages demos sync-site start stop worker-deploy

PORT ?= 8000
HOST ?= 127.0.0.1
SITE  := _site

help:
	@echo "Servidor local para probar drz-academy.github.io"
	@echo ""
	@echo "  make build      - Construye apps Next.js y ensambla $(SITE)/"
	@echo "  make cursos     - Regenera HTML y QR de todos los cursos"
	@echo "  make demos      - Regenera HTML y QR de todos los demos"
	@echo "  make sync-site  - Copia index, assets y cursos/ a $(SITE)/"
	@echo "  make start      - Arranca http://$(HOST):$(PORT) (actualiza cursos si hace falta)"
	@echo "  make stop       - Detiene el servidor en el puerto $(PORT)"
	@echo ""
	@echo "  make worker-deploy - Despliega el Worker de analytics en Cloudflare"
	@echo "  make notify-worker-deploy - Despliega el Worker de notificaciones en Cloudflare"
	@echo "  make notify-import-csv CSV=contrib/contacts-test.csv - Importa suscriptores desde CSV a KV"
	@echo "  make notify-list - Consulta la lista de suscriptores actualmente guardados"
	@echo "  make notify-send-newsletter FILE=cursos/extraterrestres/newsletter.md - Envía un newsletter"
	@echo ""
	@echo "  PORT=3000 make start   - Usar otro puerto"

cursos:
	@echo "▶  Regenerating course pages…"
	@bash -c 'shopt -s nullglob; for md in cursos/*/curso.md; do \
		[ "$$md" = "cursos/template/curso.md" ] && continue; \
		echo "  $$md"; python3 cursos/build_course.py "$$md"; \
	done'

pages: cursos

demos:
	@echo "▶  Regenerating demo pages…"
	@python3 demos/build_demo.py --all

sync-site:
	@mkdir -p $(SITE)
	@cp index.html $(SITE)/
	@cp stats.html $(SITE)/
	@rm -rf $(SITE)/assets && cp -r assets $(SITE)/assets
	@rm -rf $(SITE)/cursos && cp -r cursos $(SITE)/cursos
	@rm -rf $(SITE)/demos && cp -r demos $(SITE)/demos
	@touch $(SITE)/.nojekyll

build: cursos demos
	@echo "▶  Building Cloud Academy…"
	@cd apps/cloud_academy && npm ci --legacy-peer-deps && npm run build
	@echo "▶  Building Lighting Black Holes…"
	@cd apps/lighting-black-holes && npm ci && npm run build
	@echo "▶  Assembling $(SITE)/…"
	@rm -rf $(SITE)
	@mkdir -p $(SITE)/apps
	@$(MAKE) sync-site
	@cp -r apps/cloud_academy/out $(SITE)/apps/cloud_academy
	@cp -r apps/lighting-black-holes/out $(SITE)/apps/lighting-black-holes
	@echo "✓  Site ready in $(SITE)/"

start:
	@test -f $(SITE)/apps/cloud_academy/index.html || $(MAKE) build
	@$(MAKE) cursos demos sync-site
	@echo "Starting server on http://$(HOST):$(PORT)"
	@cd $(SITE) && nohup python3 -m http.server "$(PORT)" --bind "$(HOST)" >/dev/null 2>&1 &
	@sleep 0.2
	@echo "Started. Stop with: make stop"
	@echo "  Home:  http://$(HOST):$(PORT)/"
	@echo "  Apps:  http://$(HOST):$(PORT)/apps/cloud_academy/"
	@echo "         http://$(HOST):$(PORT)/apps/lighting-black-holes/"

stop:
	@echo "Stopping server on port $(PORT) (best-effort)"
	@PID="$$(lsof -tiTCP:$(PORT) -sTCP:LISTEN 2>/dev/null | head -n 1)"; \
	if [ -n "$$PID" ]; then \
		echo "Killing pid $$PID"; \
		kill "$$PID" 2>/dev/null || true; \
		sleep 0.2; \
		if kill -0 "$$PID" 2>/dev/null; then \
			echo "Still running, forcing stop (SIGKILL)"; \
			kill -9 "$$PID" 2>/dev/null || true; \
		fi; \
	else \
		echo "No process listening on $(PORT)."; \
	fi

worker-deploy:
	@echo "▶  Deploying analytics worker…"
	@cd analytics/worker && npx wrangler deploy

notify-worker-deploy:
	@echo "▶  Deploying notify worker…"
	@cd notify/worker && npx wrangler deploy

notify-import-csv:
	@if [ -z "$(CSV)" ]; then \
		echo "Debes indicar el archivo CSV, ej: make notify-import-csv CSV=contrib/contacts-test.csv"; \
		exit 1; \
	fi
	@echo "▶  Importing subscribers from $(CSV)…"
	@python3 notify/client/import_subscribers_from_csv.py "$(CSV)"

notify-list:
	@python3 notify/client/course_notify_client.py list-emails

notify-send-newsletter:
	@if [ -z "$(FILE)" ]; then \
		echo "Debes indicar FILE. Ej: make notify-send-newsletter FILE=cursos/extraterrestres/newsletter.md"; \
		exit 1; \
	fi
	@python3 notify/client/send_newsletter.py "$(FILE)" $(if $(SUBJECT),--subject "$(SUBJECT)",) $(if $(TEST_LIMIT),--test-limit "$(TEST_LIMIT)",) $(if $(DRY_RUN),--dry-run,)


