.PHONY: clasificar generar-boletines informe base-datos certificados certificados-drive certificados-hotmart reset-pass todo

PYTHON ?= python3
CLUB := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BIN  := $(CLUB)bin

base-datos:
	$(PYTHON) $(BIN)/build_database.py

clasificar:
	$(PYTHON) $(BIN)/clasificar_miembros.py

generar-boletines:
	$(PYTHON) $(BIN)/generar_boletines.py

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

todo: base-datos clasificar informe generar-boletines
