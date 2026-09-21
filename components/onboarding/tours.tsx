import type { Tour } from "nextstepjs";

// The "gastos" and "costos" onboarding tours for the "?" help button on
// /finanzas. Both tours live under one page (app/(dashboard)/finanzas/
// page.tsx) since /gastos and /costos merged into tabs there — the shell's
// single HelpButton picks whichever tour matches the active tab (Resumen/
// Gastos -> "gastos", Insumos/Recetas -> "costos"). Selectors deliberately
// never target a data row (supply/recipe lists can be empty) — only static
// containers, tab triggers, buttons and column headers. See the tab-sync
// `useEffect` in finanzas/page.tsx for how the underlying Radix Tabs content
// gets mounted before a step tries to highlight it.
//
// Two deliberate exceptions to that rule, both accepting the same graceful
// degrade: if the underlying list is empty, nextstepjs can't find the
// selector and just centers the card instead of crashing.
// - "#costos-restock-button" (Insumos) — only the first visible supply row
//   carries this id (components/costos/supplies-tab.tsx).
// - The "costos" tour's last four steps target EditRecipeDialog's internals
//   (#costos-recipe-dialog-*), which only exist once a recipe row is opened.
//   RecipesTab opens a demo burger for exactly that step range
//   (MODAL_TOUR_STEP_START/END in components/costos/recipes-tab.tsx) and
//   closes it again once the tour leaves that range.
export const tours: Tour[] = [
  {
    tour: "costos",
    steps: [
      {
        selector: "#costos-summary-row",
        side: "bottom",
        title: "Panorama general",
        content: (
          <>
            Estas 4 tarjetas resumen todo /costos de un vistazo: costo promedio, margen promedio,
            cuánto vale tu stock guardado, y alertas de hamburguesas bajo margen o sin receta
            cargada.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#costos-tab-supplies",
        side: "bottom",
        title: "Insumos",
        content: (
          <>Acá cargás cada insumo con su costo por unidad — carne, pan, queso, lo que uses.</>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // This step's tab ("insumos") is switched into by finanzas/page.tsx's
        // tour-sync useEffect right as this step becomes active — a couple
        // retries covers the render landing after nextstepjs's single
        // synchronous querySelector.
        selector: "#costos-supplies-card",
        side: "right",
        title: "Catálogo de insumos",
        content: (
          <>
            Nombre, unidad de medida y cómo lo comprás — por unidad, por paquete o por peso — para
            que el costo por unidad se calcule solo. Todo lo que cargues acá se usa para calcular
            el costo real de tus recetas.
          </>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
      {
        selector: "#costos-add-supply-button",
        side: "bottom",
        title: "Agregar y stock",
        content: (
          <>
            Acá sumás insumos nuevos. El campo de stock de cada fila se guarda solo al tabear o
            apretar Enter — no hace falta abrir nada para actualizarlo.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // Only the first visible supply row carries this id (see
        // components/costos/supplies-tab.tsx) — another deliberate exception
        // to the "never target a data row" rule below, same reasoning as the
        // recipe-dialog steps: if the catalog is empty, nextstepjs just
        // centers the card instead of breaking.
        selector: "#costos-restock-button",
        side: "left",
        title: "Sumar stock",
        content: (
          <>
            ¿Compraste más de un insumo? Usá este botón en vez de tocar el número de al lado: suma
            lo que compraste al stock que ya tenías, sin que tengas que hacer la cuenta vos. El
            campo de stock sigue sirviendo para corregir un valor a mano — por ejemplo, después de
            un inventario físico. Y si el insumo se compra a granel pero se carga en unidades más
            chicas — carne en kilos, medallones cargados — elegí el modo &quot;Por peso&quot; al
            editar el insumo: después vas a poder cargar directamente los kilos comprados y este
            botón te calcula solo cuántas unidades te rinden.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#costos-tab-recipes",
        side: "bottom",
        title: "Recetas",
        content: (
          <>
            Ahora pasamos a Recetas: acá se junta todo — costo, margen y cuánto te alcanza el
            stock.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // First step after the tour-sync effect flips the tab from "insumos"
        // to "recetas" — same single-querySelector race as
        // #costos-supplies-card above.
        selector: "#costos-margin-chart",
        side: "top",
        title: "Margen por hamburguesa",
        content: (
          <>
            Este gráfico ordena tus hamburguesas por margen — verde las que están bien, rojo las
            que están por debajo del objetivo. Pasá el mouse por una barra para ver costo, precio
            y margen en pesos.
          </>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
      {
        selector: "#costos-makeable-header",
        side: "bottom",
        title: "Alcanza para",
        content: (
          <>
            Con la receta cargada y el stock de tus insumos, esta columna te dice cuántas
            hamburguesas podés hacer hoy. Se pone en rojo cuando llega a cero.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#costos-recipes-card",
        side: "top",
        title: "Ver una receta",
        content: (
          <>
            Hacé click en cualquier fila para abrir su receta completa. Te abrimos un ejemplo
            para mostrarte cómo se lee.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // The recipe dialog only exists once a row is clicked — RecipesTab
        // opens a demo burger for this exact step range (see
        // MODAL_TOUR_STEP_START/END in components/costos/recipes-tab.tsx),
        // so the selector needs a couple retries while the Dialog mounts.
        selector: "#costos-recipe-dialog-verdict",
        side: "bottom",
        title: "El veredicto, arriba de todo",
        content: (
          <>
            Costo, margen — en pesos y en % — y cuántas podés hacer con el stock actual. Lo
            primero que importa, antes de bajar a los detalles.
          </>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
      {
        selector: "#costos-recipe-dialog-breakdown",
        side: "bottom",
        title: "Qué insumo te encarece la receta",
        content: (
          <>
            Los ingredientes están ordenados por costo, con una barra que muestra qué porcentaje
            del total aporta cada uno. Hacé click en la cantidad de cualquiera para editarla al
            instante — se guarda sola, sin abrir nada más.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#costos-recipe-dialog-suggestions",
        side: "left",
        title: "Sugerencias desde /menu",
        content: (
          <>
            Si la hamburguesa tiene ingredientes cargados en /menu que todavía no tienen un
            insumo asignado acá, aparecen en este panel. Vos confirmás la cantidad y con un click
            completás la receta.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#costos-recipe-dialog-suggested-price",
        side: "left",
        title: "Precio sugerido",
        content: (
          <>
            Poné un margen objetivo y te calcula el precio de venta necesario para lograrlo, con
            la diferencia contra tu precio actual. Es solo una sugerencia — tu precio real
            siempre se edita en /precios.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
    ],
  },
  {
    tour: "gastos",
    steps: [
      {
        selector: "#finanzas-tabs-list",
        side: "bottom",
        title: "Gastos e ingreso neto",
        content: (
          <>
            Acá manejás todo lo que sale de la caja, y ves tu ingreso real — no solo lo que
            facturás.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // First step in the "gastos" tab, switched into by finanzas/page.tsx's
        // tour-sync useEffect right as this step becomes active.
        selector: "#gastos-period-card",
        side: "bottom",
        title: "Gastos del período",
        content: (
          <>Cargá gastos puntuales: una compra de insumos, un pago único, con fecha y categoría.</>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
      {
        // Depends on TWO nested Tabs switching in the same tick (the outer
        // tab is already "gastos", but the inner gastosSubTab only flips
        // period -> recurring right as this step becomes active) — the
        // riskiest single-querySelector race of the whole tour.
        selector: "#gastos-recurring-card",
        side: "bottom",
        title: "Fijos mensuales",
        content: (
          <>
            Alquiler, sueldos, servicios — se cargan una vez como plantilla y se reparten solos,
            día por día. La cuenta es <strong>monto ÷ días del mes × días vigentes</strong> desde
            la fecha &quot;Vigente desde&quot;. Si lo cargás a mitad de mes, solo cuenta desde ese
            día — no el mes completo. Por eso un fijo de $120.000 cargado el 10 puede mostrar
            $85.161, no los $120.000 enteros.
          </>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
      {
        selector: "#gastos-add-recurring-button",
        side: "bottom",
        title: "Si un monto cambia",
        content: (
          <>
            Importante: si sube el alquiler, no edites el monto existente. Usá &quot;Actualizar
            monto&quot; — cierra el fijo anterior y crea uno nuevo, así los meses pasados no se
            pisan.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // First step after the tour-sync effect switches the tab from
        // "gastos" back to "resumen".
        selector: "#gastos-ledger-summary",
        side: "top",
        title: "Libro diario",
        content: (
          <>Acá arriba tenés el resumen: ingresos brutos, gastos del período, e ingreso neto real.</>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
      {
        selector: "#gastos-ledger-table-card",
        side: "top",
        title: "El detalle día por día",
        content: (
          <>
            Y acá el detalle, movimiento por movimiento con saldo corriente. Los fijos
            prorrateados (alquiler, servicios) no aparecen día por día — cada uno suma su propio
            renglón al final del período, con la etiqueta &quot;prorrateo&quot;. El saldo final
            siempre coincide con el Ingreso Neto de arriba.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
    ],
  },
  {
    tour: "menu",
    steps: [
      {
        selector: "#menu-add-burger-button",
        side: "bottom",
        title: "Hamburguesas del menú",
        content: (
          <>
            Acá creás y editás cada hamburguesa: precio, imagen, y sus ingredientes.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        // The field only exists once the create/edit Dialog is open — the
        // page's own useEffect opens it right as this step becomes active
        // (same problem the "costos" tour's recipe-dialog steps solve), so
        // this needs the same retry cushion while the Dialog mounts.
        selector: "#menu-ingredients-field",
        side: "top",
        title: "Ingredientes",
        content: (
          <>
            Estos ingredientes alimentan las sugerencias de receta en /costos: si el nombre
            coincide con un insumo ya cargado ahí, se linkean solos. Empezá a escribir y te va a
            sugerir insumos existentes — usalos para que el link sea exacto en vez de aproximado.
          </>
        ),
        showControls: true,
        showSkip: true,
        selectorRetryAttempts: 5,
        selectorRetryDelay: 200,
      },
    ],
  },
  {
    // Targets the WhatsApp message editor specifically — the delivery
    // template editor reuses the same TemplateEditor component (ids prefixed
    // "configuracion-delivery-*" instead of "configuracion-whatsapp-*") and
    // isn't covered by its own steps to keep the tour short.
    tour: "configuracion",
    steps: [
      {
        selector: "#configuracion-whatsapp-chips",
        side: "bottom",
        title: "Variables del mensaje",
        content: (
          <>
            Hacé click en cualquier chip para insertarlo donde tengas el cursor. Cada uno se
            reemplaza por un dato real del pedido — cliente, total, dirección — al copiar un
            pedido.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#configuracion-whatsapp-textarea",
        side: "right",
        title: "El texto del mensaje",
        content: (
          <>
            Editá libremente — es el mensaje completo. Una línea que solo tiene variables vacías
            (por ejemplo, sin notas o sin hora de entrega) desaparece sola; el resto de la línea
            queda como la escribiste.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#configuracion-whatsapp-preview",
        side: "left",
        title: "Vista previa",
        content: (
          <>
            Se actualiza con cada letra que escribís, usando un pedido de ejemplo que ya trae
            combo, papas sin querer, descuento y envío — así ves de una todas las secciones
            posibles, no solo las que tocaste en el último pedido real.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
      {
        selector: "#configuracion-whatsapp-actions",
        side: "top",
        title: "Guardar",
        content: (
          <>
            Los botones de Guardar y Cancelar aparecen acá apenas cambiás algo. &quot;Restaurar
            plantilla original&quot; carga de nuevo el mensaje de fábrica — pero también necesita
            que apretés Guardar para hacerse efectivo.
          </>
        ),
        showControls: true,
        showSkip: true,
      },
    ],
  },
];
