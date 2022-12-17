(function() {
    var vscode;

    var imageContainer;
    var svgImage;

    var status;
    var settings;

    window.addEventListener("load", () => {
        initPreview();
    });

    function initPreview() {
        if (typeof acquireVsCodeApi !== "undefined") {
            vscode = acquireVsCodeApi();
        }

        imageContainer = document.getElementById("image-container");
        svgImage = imageContainer.getElementsByTagName("svg")[0];

        status = JSON.parse(document.getElementById("status").innerHTML || "{}");
        settings = JSON.parse(document.getElementById("settings").innerHTML);

        if (status && imageContainer && svgImage) {
            svgImage.style.width = status.width;
            svgImage.style.height = "auto";
            svgImage.style.position = "relative";
            svgImage.style.left = "25%";
            svgImage.style.top = "25%";
            
            imageContainer.scrollLeft = status.scrollLeft;
            imageContainer.scrollTop = status.scrollTop;

            if (!status.width) {
                svgImage.style.width = window.innerWidth + "px";
                imageContainer.scrollLeft = window.innerWidth * 0.5;
                imageContainer.scrollTop = window.innerHeight * 0.5;
            }
            
            initHandlers();
        }

        showErrors();
    };

    function initHandlers() {
        handleMove();
        handleZoom();
        handleClick();
    }

    function showErrors() {
        let hasError = !!document.getElementById("errtxt").innerText.trim();
        if(!hasError) {
            document.getElementById("error-warning").style.display = "none";
        }
        
        if (!settings.showSpinner) {
            document.getElementById("spinner-container").remove();
        }
    }

    function handleClick(){
        svgImage.addEventListener("click", (event) => {
            if(event.target.tagName != "text") {
                return;
            }

            const message = {
                searchText: event.target.innerHTML
            };

            vscode.postMessage(message);
        });
    }

    function handleZoom() {
        const isMac = navigator.userAgentData.platform.toUpperCase().indexOf('MAC') >= 0;
        let imageWidth = parseFloat(svgImage.style.width);

        imageContainer.addEventListener("scroll", (ev) => {
            saveStatus();
        });

        imageContainer.addEventListener("wheel", (ev) => {
            if (isMac ? !ev.altKey : !ev.ctrlKey) { 
                return;
            }
            
            ev.preventDefault();

            if (imageWidth < 10) {
                imageWidth = 10;
            }
            
            let scaleFactor = 0.1;
            let scaleUp = ev.deltaY < 0;
            let scrollDiff = imageWidth * (scaleFactor/2);

            if (scaleUp) {
                imageWidth = parseInt((imageWidth + (imageWidth * scaleFactor)));
                imageContainer.scrollLeft = imageContainer.scrollLeft + scrollDiff;
                imageContainer.scrollTop = imageContainer.scrollTop + scrollDiff;
            } else {
                imageWidth = parseInt((imageWidth - (imageWidth * scaleFactor)));
                imageContainer.scrollLeft = imageContainer.scrollLeft - scrollDiff;
                imageContainer.scrollTop = imageContainer.scrollTop - scrollDiff;
            }

            svgImage.style.width = imageWidth + "px";
            saveStatus();
        },  { passive: false });
    }

    function handleMove() {
        let moveConfig = {
            isDown: false,
            startX: 0,
            startY: 0,
            scrollLeft: 0,
            scrollTop: 0
        };
        
        imageContainer.addEventListener("mousedown", event => {
            imageContainer.classList.add("active");
            
            moveConfig = {
                isDown: true,
                startX: event.pageX - imageContainer.offsetLeft,
                startY: event.pageY - imageContainer.offsetTop,
                scrollLeft: imageContainer.scrollLeft,
                scrollTop: imageContainer.scrollTop,
            };
        });
                        
        imageContainer.addEventListener("mouseleave", () => {
            imageContainer.classList.remove("active");
            moveConfig.isDown = false;
        });

        imageContainer.addEventListener("mouseup", () => {
            imageContainer.classList.remove("active");
            moveConfig.isDown = false;
        });

        imageContainer.addEventListener("mousemove", event => {
            if (!moveConfig.isDown) {
                return;
            }

            event.preventDefault();
            
            const pageX = event.pageX - imageContainer.offsetLeft;
            const walk = pageX - moveConfig.startX;
            imageContainer.scrollLeft = moveConfig.scrollLeft - walk;

            const pageY = event.pageY - imageContainer.offsetTop;
            const walkY = pageY - moveConfig.startY;
            imageContainer.scrollTop = moveConfig.scrollTop - walkY;
            
            saveStatus();
        });
    }

    function throttle(fn, delay, atleast) {
        var timeout = null,
            startTime = new Date();
        return function (...args) {
            var curTime = new Date();
            clearTimeout(timeout);
            if (curTime - startTime >= atleast) {
                fn(...args);
                startTime = curTime;
            } else {
                timeout = setTimeout(fn, delay, ...args);
            }
        }
    }

    var saveStatus = throttle(() => {
        if (vscode) {
            const status = {
                scrollLeft: imageContainer.scrollLeft,
                scrollTop: imageContainer.scrollTop,
                width: svgImage.style.width
            };

            vscode.postMessage(status);
        }
    }, 500, 1000);
})();