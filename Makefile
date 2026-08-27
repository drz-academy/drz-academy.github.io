.PHONY: help build cursos pages demos sync-site start stop worker-deploy update club-worker-deploy club-dev club-sync club-base-datos club-clasificar club-informe club-boletines generar-boletines club-enviar-boletines club-certificados club-certificados-drive club-certificados-hotmart club-reset-pass portal-worker-deploy portal-dev portal-sync

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
	@echo "  make stash      - Guarda cambios locales temporalmente (git stash)"
	@echo "  make update     - Actualiza todas las aplicaciones desde GitHub"
	@echo "  make update_drake_calculator - Actualiza solo la Calculadora de Drake"
	@echo "  make update_star_trek        - Actualiza solo la aplicación Star Trek"
	@echo ""
	@echo "  make worker-deploy - Despliega el Worker de analytics en Cloudflare"
	@echo "  make notify-worker-deploy - Despliega el Worker de notificaciones en Cloudflare"
	@echo "  make notify-import-csv CSV=contrib/archivo.csv - Importa suscriptores desde CSV (Google, MailChimp, etc) a KV"
	@echo "  make notify-list - Consulta la lista de suscriptores actualmente guardados"
	@echo "  make notify-number - Muestra la cantidad total de suscriptores guardados"
	@echo "  make notify-reset - Borra la lista de todos los suscriptores guardados"
	@echo "  make subscribe [FILE=...] - Suscribe los correos de un archivo (por defecto .secrets/subscribers.md)"
	@echo "  make notify-send-newsletter FILE=notify/newsletter.md [TEST_EMAILS=a@b.com] - Envía un newsletter (usa TEST_EMAILS para enviar solo a esos correos de prueba)"
	@echo "  make notify-preview-newsletter FILE=notify/newsletter.md - Previsualiza el newsletter en el navegador antes de enviarlo"
	@echo ""
	@echo "  make club-worker-deploy - Despliega el Worker del Club"
	@echo "  make club-sync          - Sube miembros y catálogo de club/ a Cloudflare KV"
	@echo "  make club-reset-pass    - Borra todas las claves del Club (vuelven a crearla)"
	@echo "  make club-dev           - Worker local en http://127.0.0.1:8787"
	@echo "  make club-base-datos    - Regenera la base de miembros (Excel → JSON)"
	@echo "  make club-clasificar    - Clasifica Oro / Plata / Bronce"
	@echo "  make club-informe       - Genera club/personal/drz-club.md"
	@echo "  make generar-boletines  - HTML individuales + script de envío (club/personal/boletines/)"
	@echo "  make club-boletines     - igual que generar-boletines"
	@echo "  make club-enviar-boletines - Envía todos los boletines (Gmail; pide confirmación)"
	@echo "  make club-certificados  - Parte y nombra PDFs en personal/certificados/"
	@echo "  make club-certificados-hotmart - Avisos Hotmart nuevos (AstroPython, Cuántica permanente)"
	@echo "  make club-certificados-drive - Enlaces de Drive → personal/certificados.csv"
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
	@rm -rf $(SITE)/analytics && cp -r analytics $(SITE)/analytics
	@rm -rf $(SITE)/club
	@mkdir -p $(SITE)/club
	@cp club/index.html club/portal.js club/categorias.json $(SITE)/club/
	@python3 club/bin/generar_stats.py --out $(SITE)/club/stats.json
	@rm -rf $(SITE)/portal
	@mkdir -p $(SITE)/portal
	@printf '%s\n' '<!doctype html><meta http-equiv="refresh" content="0;url=/club/"><link rel="canonical" href="/club/">' > $(SITE)/portal/index.html
	@touch $(SITE)/.nojekyll

build: cursos demos
	@echo "▶  Building Cloud Academy…"
	@cd apps/cloud_academy && npm ci --legacy-peer-deps && npm run build
	@echo "▶  Building Lighting Black Holes…"
	@cd apps/lighting-black-holes && npm ci && npm run build
	@echo "▶  Building Drake Calculator…"
	@cd apps/drake-calculator && npm ci && npm run build
	@echo "▶  Building Star Trek app…"
	@cd apps/star-trek && npm ci && npm run build
	@echo "▶  Assembling $(SITE)/…"
	@rm -rf $(SITE)
	@mkdir -p $(SITE)/apps
	@$(MAKE) sync-site
	@cp -r apps/cloud_academy/out $(SITE)/apps/cloud_academy
	@cp -r apps/lighting-black-holes/out $(SITE)/apps/lighting-black-holes
	@cp -r apps/drake-calculator/out $(SITE)/apps/drake-calculator
	@cp -r apps/star-trek/out $(SITE)/apps/star-trek
	@echo "✓  Site ready in $(SITE)/"

start:
	@if [ ! -f $(SITE)/apps/cloud_academy/index.html ] || [ ! -f $(SITE)/apps/lighting-black-holes/index.html ] || [ ! -f $(SITE)/apps/drake-calculator/index.html ] || [ ! -f $(SITE)/apps/star-trek/index.html ]; then $(MAKE) build; fi
	@$(MAKE) cursos demos sync-site
	@echo "Starting server on http://$(HOST):$(PORT)"
	@cd $(SITE) && nohup python3 -m http.server "$(PORT)" --bind "$(HOST)" >/dev/null 2>&1 &
	@sleep 0.2
	@echo "Started. Stop with: make stop"
	@echo "  Home:  http://$(HOST):$(PORT)/"
	@echo "  Club:  http://$(HOST):$(PORT)/club/"
	@echo "  Apps:  http://$(HOST):$(PORT)/apps/cloud_academy/"
	@echo "         http://$(HOST):$(PORT)/apps/lighting-black-holes/"
	@echo "         http://$(HOST):$(PORT)/apps/drake-calculator/"
	@echo "         http://$(HOST):$(PORT)/apps/star-trek/"

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

stash:
	@echo "▶  Sincronizando cambios remotos y resolviendo (pull & merge)..."
	@if git diff-index --quiet HEAD --; then \
		git pull --no-rebase; \
	else \
		git stash && git pull --no-rebase && git stash pop || echo "⚠️ Revisa si hubo conflictos al restaurar tus cambios locales."; \
	fi

update: update_drake_calculator update_star_trek

update_drake_calculator:
	@echo "▶  Updating Drake Calculator from GitHub…"
	@rm -rf apps/drake-calculator
	@mkdir -p /tmp/seap-temp
	@curl -sL https://github.com/seap-udea/seap-udea.github.io/archive/main.tar.gz | tar xz -C /tmp/seap-temp
	@mv /tmp/seap-temp/seap-udea.github.io-main/apps/drake-calculator apps/
	@rm -rf /tmp/seap-temp
	@echo "▶  Building Drake Calculator…"
	@cd apps/drake-calculator && npm ci && npm run build
	@mkdir -p $(SITE)/apps/drake-calculator
	@rm -rf $(SITE)/apps/drake-calculator/*
	@cp -r apps/drake-calculator/out/* $(SITE)/apps/drake-calculator/
	@echo "✓  Drake Calculator updated and rebuilt."

update_star_trek:
	@echo "▶  Updating Star Trek app from GitHub…"
	@rm -rf apps/star-trek
	@mkdir -p /tmp/seap-temp
	@curl -sL https://github.com/seap-udea/seap-udea.github.io/archive/main.tar.gz | tar xz -C /tmp/seap-temp
	@mv /tmp/seap-temp/seap-udea.github.io-main/apps/star-trek apps/
	@rm -rf /tmp/seap-temp
	@echo "▶  Building Star Trek app…"
	@cd apps/star-trek && npm ci && npm run build
	@mkdir -p $(SITE)/apps/star-trek
	@rm -rf $(SITE)/apps/star-trek/*
	@cp -r apps/star-trek/out/* $(SITE)/apps/star-trek/
	@echo "✓  Star Trek app updated and rebuilt."

worker-deploy:
	@echo "▶  Deploying analytics worker…"
	@cd analytics/worker && npx wrangler deploy

notify-worker-deploy:
	@echo "▶  Deploying notify worker…"
	@cd notify/worker && npx wrangler deploy

club-worker-deploy portal-worker-deploy:
	@echo "▶  Deploying club worker…"
	@cd club/worker && npx wrangler deploy

club-dev portal-dev:
	@echo "▶  Club worker en http://127.0.0.1:8787"
	@cd club/worker && npx wrangler dev --ip 127.0.0.1 --port 8787

club-sync portal-sync:
	@python3 club/client/sync_members.py

club-reset-pass:
	@$(MAKE) -C club reset-pass

club-base-datos:
	@$(MAKE) -C club base-datos

club-clasificar:
	@$(MAKE) -C club clasificar

club-informe:
	@$(MAKE) -C club informe

generar-boletines club-boletines:
	@$(MAKE) -C club generar-boletines

club-enviar-boletines:
	@$(MAKE) -C club enviar-boletines

club-certificados:
	@$(MAKE) -C club certificados

club-certificados-hotmart:
	@$(MAKE) -C club certificados-hotmart

club-certificados-drive:
	@$(MAKE) -C club certificados-drive

notify-import-csv:
	@if [ -z "$(CSV)" ]; then \
		echo "Debes indicar el archivo CSV, ej: make notify-import-csv CSV=contrib/subscribed_email_audience_export_98cca95302.csv"; \
		exit 1; \
	fi
	@echo "▶  Importing subscribers from $(CSV)…"
	@python3 notify/client/import_subscribers_from_csv.py "$(CSV)"

notify-list:
	@python3 notify/client/course_notify_client.py list-emails

notify-number:
	@printf "Número total de suscriptores: "
	@python3 notify/client/course_notify_client.py count

notify-reset:
	@echo "Borrando todos los suscriptores de la base de datos..."
	@python3 notify/client/course_notify_client.py reset

subscribe:
	@python3 notify/client/subscribe_from_file.py "$${FILE:-.secrets/subscribers.md}"

notify-send-newsletter:
	@if [ -z "$(FILE)" ]; then \
		echo "Debes indicar FILE. Ej: make notify-send-newsletter FILE=cursos/extraterrestres/newsletter.md"; \
		exit 1; \
	fi
	@python3 notify/client/send_newsletter.py "$(FILE)" $(if $(SUBJECT),--subject "$(SUBJECT)",) $(if $(TEST_EMAILS),--test-emails "$(TEST_EMAILS)",) $(if $(DRY_RUN),--dry-run,)

notify-preview-newsletter:
	@if [ -z "$(FILE)" ]; then \
		echo "Debes indicar FILE. Ej: make notify-preview-newsletter FILE=notify/newsletter-sitio-web.md"; \
		exit 1; \
	fi
	@python3 notify/client/send_newsletter.py "$(FILE)" --preview
# --- dev/cleanall (auto) ---
include .dev_common.mk

.PHONY: cleanall

cleanall: _dev_cleanall

.PHONY: env

env: _dev_env
