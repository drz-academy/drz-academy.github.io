.PHONY: clasificar generar-boletines enviar-boletines informe base-datos certificados certificados-drive certificados-hotmart reset-pass reset-forms todo

PYTHON ?= python3
CLUB := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BIN  := $(CLUB)bin
BOLETINES := $(CLUB)personal/boletines

base-datos:
	$(PYTHON) $(BIN)/build_database.py

clasificar:
	$(PYTHON) $(BIN)/clasificar_miembros.py

# HTML por persona + personal/boletines/enviar-todos.py
generar-boletines:
	$(PYTHON) $(BIN)/generar_boletines.py

enviar-boletines:
	@if [ ! -f "$(BOLETINES)/enviar-todos.py" ]; then \
		echo "No hay script de envío. Primero: make generar-boletines"; \
		exit 1; \
	fi
	$(PYTHON) $(BOLETINES)/enviar-todos.py

informe:
	$(PYTHON) $(BIN)/generar_informe.py

certificados:
	$(PYTHON) $(BIN)/organizar_certificados.py

certificados-drive:
	$(PYTHON) $(BIN)/enlazar_certificados.py

certificados-hotmart:
	$(PYTHON) $(BIN)/generar_certificados_hotmart.py

reset-pass:
	$(PYTHON) $(CLUB)client/reset_passwords.py

reset-forms:
	$(PYTHON) $(CLUB)client/reset_forms.py

todo: base-datos clasificar informe generar-boletines
