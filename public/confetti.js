async function createConfetti() {
  if (typeof tsParticles === "undefined") {
    console.error("tsParticles library not loaded");
    return;
  }

  // Create container
  const container = document.createElement("div");
  container.id = "tsparticles";
  document.body.appendChild(container);

  // Initialize tsParticles
  await tsParticles.load({
    id: "tsparticles",
    options: {
      fullScreen: {
        zIndex: 1,
      },
      particles: {
        color: {
          value: ["#FFFFFF", "#FFd700"],
        },
        move: {
          direction: "bottom",
          enable: true,
          outModes: {
            default: "out",
          },
          size: true,
          speed: {
            min: 1,
            max: 3,
          },
        },
        number: {
          value: 200,
          density: {
            enable: true,
            area: 800,
          },
        },
        opacity: {
          value: 1,
          animation: {
            enable: true,
            startValue: "max",
            endValue: "min",
            speed: 1,
            sync: false,
          },
        },
        rotate: {
          value: {
            min: 0,
            max: 360,
          },
          direction: "random",
          move: true,
          animation: {
            enable: true,
            speed: 60,
          },
        },
        tilt: {
          direction: "random",
          enable: true,
          move: true,
          value: {
            min: 0,
            max: 360,
          },
          animation: {
            enable: true,
            speed: 60,
          },
        },
        shape: {
          type: ["circle", "square", "triangle", "polygon"],
          options: {
            polygon: [
              {
                sides: 5,
              },
              {
                sides: 6,
              },
            ],
          },
        },
        size: {
          value: {
            min: 2,
            max: 4,
          },
        },
        roll: {
          darken: {
            enable: true,
            value: 30,
          },
          enlighten: {
            enable: true,
            value: 30,
          },
          enable: true,
          speed: {
            min: 15,
            max: 25,
          },
        },
        wobble: {
          distance: 30,
          enable: true,
          move: true,
          speed: {
            min: -15,
            max: 15,
          },
        },
      },
    },
  });

  // אוטומטית נעלם אחרי 5 שניות
  setTimeout(async () => {
    const particles = tsParticles.dom()[0];
    if (particles) {
      await particles.destroy();
    }
    container.remove();
  }, 5000);
}
