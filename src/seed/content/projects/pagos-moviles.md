---
title: Pagos Móviles
summary: Sistema distribuido de pagos digitales entre usuarios del mismo banco o de bancos distintos.
context: Colegio Universitario de Cartago · Programación IV
date: 2024-12
tags:
  - C# / ASP.NET
  - Java
  - Python
  - SQL
image: /assets/projects/pagos-moviles.jpg
imageAlt: Diagrama del sistema de pagos móviles
featured: true
order: 4
---

### Descripción

Pagos Móviles es un sistema de pagos digitales diseñado para facilitar transacciones entre usuarios de un mismo banco o de bancos distintos, implementado con una arquitectura distribuida de varios servicios.

### Componentes principales

- **Servicio externo:** recibe las solicitudes de pago y se comunica con el orquestador.
- **Servicio orquestador:** coordina la comunicación entre el receptor externo, los servicios bancarios y los servicios web adicionales.
- **Servicio bancario:** verifica y actualiza las cuentas en la base de datos.
